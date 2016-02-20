let React = require("react");
let Link = require("react-router/lib/components/Link");
let FluxMixin = require("fluxxor/lib/flux_mixin")(React);
let StoreWatchMixin = require("fluxxor/lib/store_watch_mixin");
let BigNumber = require("bignumber.js");
let _ = require("lodash");
let moment = require("moment");
let ReportConfirmedModal = require("./ReportConfirmedModal");
let MarketRow = require("../markets-page/MarketRow");
let utils = require("../../libs/utilities");
let constants = require("../../libs/constants");

let ReportsPage = React.createClass({
    mixins: [FluxMixin, StoreWatchMixin("asset", "branch", "config", "network", "report")],

    getStateFromFlux() {
        let flux = this.getFlux();

        let state = {
            account: flux.store("config").getAccount(),
            asset: flux.store("asset").getState(),
            blockNumber: flux.store("network").getState().blockNumber,
            currentBranch: flux.store("branch").getCurrentBranch(),
            events: flux.store("report").getState().eventsToReport
        };

        if (state.currentBranch) {
            state.report = flux.store("report").getReport(
                state.currentBranch.id,
                state.currentBranch.reportPeriod
            );
        }

        return state;
    },

    confirmReport() {
        console.log("ReportsPage: todo: confirm the report");
        this.props.toggleConfirmReportModal();
    },

    render() {
        let self = this;

        let branchStore = this.getFlux().store('branch');
        let isCommitPeriod = branchStore.isReportCommitPeriod(self.state.blockNumber);
        let isRevealPeriod = !isCommitPeriod;

        var event, market, report, marketRows = [];
        if (this.state.currentBranch) {
            let periodLength = this.state.currentBranch.periodLength;
            let commitPeriodEndMillis = 0;
            if (isCommitPeriod) {
                commitPeriodEndMillis = moment.duration(constants.SECONDS_PER_BLOCK * ((periodLength / 2) - (this.state.blockNumber % (periodLength / 2))), "seconds");
            }
            let revealPeriodEndMillis = moment.duration(constants.SECONDS_PER_BLOCK * (periodLength - (this.state.blockNumber % periodLength)), "seconds");

            for (var eventID in this.state.events) {
                if (!this.state.events.hasOwnProperty(eventID)) continue;
                event = this.state.events[eventID];
                market = event.markets[0];
                if (!market) continue;
                report = {
                    reportedOutcome: event.report.reportedOutcome,
                    isUnethical: event.report.isUnethical,
                    isCommitPeriod: isCommitPeriod,
                    isRevealPeriod: isRevealPeriod,
                    confirmReport: this.confirmReport,
                    isConfirmed: false,
                    commitPeriodEndMillis: commitPeriodEndMillis,
                    revealPeriodEndMillis: revealPeriodEndMillis
                };
                marketRows.push(
                    <MarketRow key={market.id} market={market} report={report} />
                );
            }
        }

        // let events = _.filter(this.state.events, (event) => {
        //     let query = this.props.query;
        //     if (query.previous != null) {
        //         return event.markets[0].matured;
        //     } else if (query.committed != null) {
        //         return isRevealPeriod;
        //     } else {
        //         return isCommitPeriod;
        //     }
        // });

        return (
            <div>
                <h1>
                    Reporting
                </h1>

                <div className="row submenu">
                    <a className="collapsed" data-toggle="collapse" href="#collapseSubmenu"
                       aria-expanded="false"
                       aria-controls="collapseSubmenu">
                        <h2>Navigation</h2>
                    </a>

                    <div id="collapseSubmenu" className="col-xs-12 collapse" aria-expanded="false">
                        <ul className="list-group" role="tablist" id="tabpanel">
                            <li role="presentation" className={`list-group-item ${this.props.query.pending != null ? 'active' : ''}`}>
                                <Link to='reports' query={{pending: true}} role="tab" activeClassName="">
                                    Pending Reports
                                </Link>
                            </li>
                            <li role="presentation" className={`list-group-item ${this.props.query.committed != null ? 'active' : ''}`}>
                                <Link to="reports" query={{committed: true}} role="tab" activeClassName="">
                                    Pending Confirmations
                                </Link>
                            </li>
                            <li role="presentation" className={`list-group-item ${this.props.query.previous != null ? 'active' : ''}`}>
                                <Link to="reports" query={{previous: true}} role="tab" activeClassName="">
                                    Previous Reports
                                </Link>
                            </li>
                        </ul>
                    </div>
                </div>

                <div className="row">
                    <div className="col-xs-12">
                        {marketRows}
                    </div>
                </div>
                <ReportConfirmedModal
                    show={this.props.reportConfirmedModalOpen}
                    onHide={this.props.toggleConfirmReportModal} />
            </div>
        )
    }
});
module.exports = ReportsPage;