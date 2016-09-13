/**
 * Tools to adjust positions in Augur markets for display.
 * @author Jack Peterson (jack@tinybike.net)
 */

"use strict";

var async = require("async");
var BigNumber = require("bignumber.js");
var abi = require("augur-abi");
var constants = require("../constants");
var utils = require("../utilities");

module.exports = {

    /**
     * @param {string} typeCode Type code (buy=1, sell=2); integer 32-byte hex.
     * @param {BigNumber} position Starting number of shares.
     * @param {string} numShares Shares to add or subtract; fixedpoint 32-byte hex.
     * @return {BigNumber} Modified number of shares.
     */
    modifyPosition: function (typeCode, position, numShares) {
        var unfixedNumShares = abi.unfix(numShares);
        var newPosition;
        switch (parseInt(typeCode, 16)) {
        case 1: // buy
            newPosition = position.plus(unfixedNumShares);
            break;
        default: // sell
            newPosition = position.minus(unfixedNumShares);
            break;
        }
        return newPosition;
    },

    /**
     * Calculates the total number of complete sets bought/sold.
     *
     * @param {Array} logs Event logs from eth_getLogs request.
     * @return {Object} Total number of complete sets keyed by market ID.
     */
    calculateCompleteSetsShareTotals: function (logs) {
        var marketID, logData, shareTotals;
        shareTotals = {};
        for (var i = 0, numLogs = logs.length; i < numLogs; ++i) {
            if (logs[i] && logs[i].data && logs[i].data !== "0x") {
                marketID = logs[i].topics[2];
                if (!shareTotals[marketID]) shareTotals[marketID] = constants.ZERO;
                logData = this.rpc.unmarshal(logs[i].data);
                if (logData && logData.length) {
                    shareTotals[marketID] = this.modifyPosition(logs[i].topics[3], shareTotals[marketID], logData[0]);
                }
            }
        }
        return shareTotals;
    },

    /**
     * Calculates the largest number of shares short sold in any outcome per market.
     *
     * @param {Array} logs Event logs from eth_getLogs request.
     * @return Object Largest total number of shares sold keyed by market ID.
     */
    calculateShortSellShareTotals: function (logs) {
        var marketID, logData, shareTotals, sharesOutcomes, numOutcomes, outcomeID;
        shareTotals = {};
        sharesOutcomes = {};
        for (var i = 0, numLogs = logs.length; i < numLogs; ++i) {
            if (logs[i] && logs[i].data && logs[i].data !== "0x") {
                marketID = logs[i].topics[1];
                logData = this.rpc.unmarshal(logs[i].data);
                if (!sharesOutcomes[marketID]) sharesOutcomes[marketID] = {};
                outcomeID = parseInt(logData[3], 16).toString();
                if (!sharesOutcomes[marketID][outcomeID]) sharesOutcomes[marketID][outcomeID] = constants.ZERO;
                sharesOutcomes[marketID][outcomeID] = sharesOutcomes[marketID][outcomeID].plus(abi.unfix(logData[1]));
                shareTotals[marketID] = BigNumber.max(
                    sharesOutcomes[marketID][outcomeID],
                    shareTotals[marketID] || constants.ZERO);
            }
        }
        return shareTotals;
    },

    /**
     * @param {Object} position Starting position in a market {outcomeID: String{decimal}}.
     * @param {BigNumber} adjustment Amount to decrease all positions by.
     * @return {Object} Decreased market position {outcomeID: String{decimal}}.
     */
    decreasePosition: function (position, adjustment) {
        var newPosition = {};
        var outcomeIDs = Object.keys(position);
        for (var i = 0, numOutcomeIDs = outcomeIDs.length; i < numOutcomeIDs; ++i) {
            newPosition[outcomeIDs[i]] = new BigNumber(position[outcomeIDs[i]], 10).minus(adjustment).toFixed();
        }
        return newPosition;
    },

    /**
     * Adjusts positions by subtracting out contributions from auto-generated
     * buyCompleteSets during shortAsk (or implicitly during short_sell).
     *
     * Standalone (non-delegated) buyCompleteSets are assumed to be part of
     * generateOrderBook, and are included in the user's position.
     *
     * sellCompleteSets - shortAskBuyCompleteSets
     *
     * Note: short_sell on-contract does not create a buyCompleteSets log.
     *
     * @param {string} account Ethereum account address.
     * @param {Array} marketIDs List of market IDs for position adjustment.
     * @param {Object} shareTotals Share totals keyed by log type.
     * @param {function=} callback Callback function (optional).
     * @return {Object} Adjusted positions keyed by marketID.
     */
    adjustPositions: function (account, marketIDs, shareTotals, callback) {
        var self = this;
        var adjustedPositions = {};
        if (!utils.is_function(callback)) {
            var onChainPosition, marketID, shortAskBuyCompleteSetsShareTotal, shortSellBuyCompleteSetsShareTotal, sellCompleteSetsShareTotal;
            for (var i = 0, numMarketIDs = marketIDs.length; i < numMarketIDs; ++i) {
                marketID = marketIDs[i];
                onChainPosition = this.getPositionInMarket(marketID, account);
                shortAskBuyCompleteSetsShareTotal = shareTotals.shortAskBuyCompleteSets[marketID] || constants.ZERO;
                shortSellBuyCompleteSetsShareTotal = shareTotals.shortSellBuyCompleteSets[marketID] || constants.ZERO;
                sellCompleteSetsShareTotal = shareTotals.sellCompleteSets[marketID] || constants.ZERO;
                adjustedPositions[marketID] = this.decreasePosition(
                    onChainPosition,
                    shortAskBuyCompleteSetsShareTotal.plus(shortSellBuyCompleteSetsShareTotal).plus(sellCompleteSetsShareTotal));
            }
            return adjustedPositions;
        }
        async.eachSeries(marketIDs, function (marketID, nextMarket) {
            self.getPositionInMarket(marketID, account, function (onChainPosition) {
                if (!onChainPosition) return nextMarket("couldn't load position in " + marketID);
                if (onChainPosition.error) return nextMarket(onChainPosition);
                shortAskBuyCompleteSetsShareTotal = shareTotals.shortAskBuyCompleteSets[marketID] || constants.ZERO;
                shortSellBuyCompleteSetsShareTotal = shareTotals.shortSellBuyCompleteSets[marketID] || constants.ZERO;
                sellCompleteSetsShareTotal = shareTotals.sellCompleteSets[marketID] || constants.ZERO;
                adjustedPositions[marketID] = self.decreasePosition(
                    onChainPosition,
                    shortAskBuyCompleteSetsShareTotal.plus(shortSellBuyCompleteSetsShareTotal).plus(sellCompleteSetsShareTotal));
                nextMarket();
            });
        }, function (err) {
            if (err) return callback(err);
            callback(null, adjustedPositions);
        });
    },

    /**
     * @param {Object} shareTotals Share totals keyed by log type.
     * @return {Array} marketIDs List of market IDs for position adjustment.
     */
    findUniqueMarketIDs: function (shareTotals) {
        return Object.keys(shareTotals.shortAskBuyCompleteSets)
            .concat(Object.keys(shareTotals.shortSellBuyCompleteSets))
            .concat(Object.keys(shareTotals.sellCompleteSets))
            .filter(utils.unique);
    },

    /**
     * @param {Object} logs Event logs from eth_getLogs request.
     * @return {Object} Share totals keyed by log type.
     */
    calculateShareTotals: function (logs) {
        return {
            shortAskBuyCompleteSets: this.calculateCompleteSetsShareTotals(logs.shortAskBuyCompleteSets),
            shortSellBuyCompleteSets: this.calculateShortSellShareTotals(logs.shortSellBuyCompleteSets),
            sellCompleteSets: this.calculateCompleteSetsShareTotals(logs.sellCompleteSets)
        };
    },

    /**
     * @param {string} account Ethereum account address.
     * @param {Object=} options eth_getLogs parameters (optional).
     * @param {function=} callback Callback function (optional).
     * @return {Object} Adjusted positions keyed by marketID.
     */
    getAdjustedPositions: function (account, options, callback) {
        var self = this;
        if (!callback && utils.is_function(options)) {
            callback = options;
            options = null;
        }
        options = options || {};
        if (!utils.is_function(callback)) {
            var shareTotals = this.calculateShareTotals({
                shortAskBuyCompleteSets: this.getShortAskBuyCompleteSetsLogs(account, options),
                shortSellBuyCompleteSets: this.getTakerShortSellLogs(account, options),
                sellCompleteSets: this.getSellCompleteSetsLogs(account, options)
            });
            var marketIDs = options.market ? [options.market] : this.findUniqueMarketIDs(shareTotals);
            return this.adjustPositions(account, marketIDs, shareTotals);
        }
        async.parallel({
            shortAskBuyCompleteSets: function (done) {
                self.getShortAskBuyCompleteSetsLogs(account, options, done);
            },
            shortSellBuyCompleteSets: function (done) {
                self.getTakerShortSellLogs(account, options, done);
            },
            sellCompleteSets: function (done) {
                self.getSellCompleteSetsLogs(account, options, done);
            }
        }, function (err, logs) {
            if (err) return callback(err);
            var shareTotals = self.calculateShareTotals(logs);
            var marketIDs = options.market ? [options.market] : self.findUniqueMarketIDs(shareTotals);
            self.adjustPositions(account, marketIDs, shareTotals, callback);
        });
    },

    /**
     * Convenience getAdjustedPositions wrapper for a single market.
     *
     * @param {string} account Ethereum account address.
     * @param {string} marketID Augur market ID.
     * @param {Object=} options eth_getLogs parameters (optional).
     * @param {function=} callback Callback function (optional).
     * @return {Object} Adjusted positions keyed by marketID.
     */
    getAdjustedPositionInMarket: function (account, marketID, options, callback) {
        if (!callback && utils.is_function(options)) {
            callback = options;
            options = null;
        }
        options = options || {};
        options.market = marketID;
        return this.getAdjustedPositions(account, options, callback);
    }
};
