import { createSelector } from "reselect";
import {
  selectLoginAccountAddress,
  selectMarketTradingHistoryState
} from "store/select-state";
import selectAllMarkets from "modules/markets/selectors/markets-all";
import { getLastTradeTimestamp } from "modules/portfolio/helpers/get-last-trade-timestamp";
import { isSameAddress } from "utils/isSameAddress";

export const selectAuthorOwnedMarkets = createSelector(
  selectAllMarkets,
  selectMarketTradingHistoryState,
  selectLoginAccountAddress,
  (allMarkets, marketTradingHistory, authorId) => {
    if (!allMarkets || !authorId) return null;
    const filteredMarkets = allMarkets.filter(
      market => isSameAddress(market.author, authorId)
    );
    return filteredMarkets.map(m => ({
      ...m,
      recentlyTraded: getLastTradeTimestamp(marketTradingHistory[m.id])
    }));
  }
);
