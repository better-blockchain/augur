import store, { AppState } from "store";
import * as constants from "modules/common/constants";
import setAlertText from "modules/alerts/actions/set-alert-text";
import { createBigNumber } from "utils/create-big-number";
import makePath from "modules/routes/helpers/make-path";
import { TRANSACTIONS } from "modules/routes/constants/views";
import { selectCurrentTimestampInSeconds } from "store/select-state";
import { getNetworkId } from "modules/contracts/actions/contractCalls";
import { ThunkDispatch } from "redux-thunk";
import { Action } from "redux";
import { PREFILLEDSTAKE, DOINITIALREPORT, CONTRIBUTE } from "modules/common/constants";

export const ADD_ALERT = "ADD_ALERT";
export const REMOVE_ALERT = "REMOVE_ALERT";
export const UPDATE_EXISTING_ALERT = "UPDATE_EXISTING_ALERT";
export const CLEAR_ALERTS = "CLEAR_ALERTS";

function packageAlertInfo(id: string, timestamp: number, transaction: any) {
  return {
    id,
    timestamp,
    status: constants.CONFIRMED,
    linkPath: makePath(TRANSACTIONS),
    seen: false,
    log: {
      price: transaction && transaction.price,
      outcome: transaction && transaction.outcome,
      amount: transaction && transaction.amount,
      marketId: transaction && transaction.market && transaction.market.id,
      quantity: transaction && transaction.quantity,
      value: transaction && transaction.value
    }
  };
}

export function handleFilledOnly(tradeInProgress: any = null) {
  return (dispatch: ThunkDispatch<void, any, Action>, getState: () => AppState) => {
    const { alerts } = store.getState();
    // TODO: transaction data is getting replaced by transaction lifecycle hooks
    const transactionsData = {};
    for (let i = 0; i < alerts.length; i++) {
      if (alerts[i].status.toLowerCase() === constants.PENDING) {
        const tradeGroupId = alerts[i].params._tradeGroupId;
        if (
          tradeInProgress &&
          tradeInProgress.tradeGroupId === tradeGroupId &&
          alerts[i].params.type.toUpperCase() ===
            constants.PUBLICFILLBESTORDERWITHLIMIT &&
          alerts[i].description === ""
        ) {
          const difference = createBigNumber(tradeInProgress.numShares).minus(
            tradeInProgress.sharesFilled
          );
          // handle fill only orders alerts updates.
          dispatch(
            updateAlert(alerts[i].id, {
              id: alerts[i].id,
              status: constants.CONFIRMED,
              timestamp:
                selectCurrentTimestampInSeconds(getState()) || Date.now(),
              seen: false,
              log: {
                noFill: true,
                orderType:
                  alerts[i].params._direction === "0x1"
                    ? constants.BUY
                    : constants.SELL,
                difference: difference.toFixed()
              }
            })
          );
        } else {
          Object.keys(transactionsData).some(key => {
            if (
              transactionsData[key].transactions &&
              transactionsData[key].transactions.length &&
              transactionsData[key].transactions[0].tradeGroupId ===
                tradeGroupId &&
              transactionsData[key].status.toLowerCase() ===
                constants.SUCCESS &&
              alerts[i].params.type.toUpperCase() ===
                constants.PUBLICFILLBESTORDERWITHLIMIT &&
              alerts[i].description === ""
            ) {
              // handle fill only orders alerts updates.
              dispatch(
                updateAlert(alerts[i].id, {
                  id: alerts[i].id,
                  status: constants.CONFIRMED,
                  timestamp:
                    selectCurrentTimestampInSeconds(getState()) ||
                    transactionsData[key].timestamp.timestamp,
                  seen: false,
                  log: {
                    noFill: true,
                    orderType:
                      alerts[i].params._direction === "0x1"
                        ? constants.BUY
                        : constants.SELL
                  }
                })
              );
              return true;
            }
            return false;
          });
        }
      }
    }
  };
}

export function loadAlerts() {
  return (dispatch: ThunkDispatch<void, any, Action>, getState: () => AppState) => {
    const { alerts } = store.getState();
    // TODO: transaction data is getting replaced by transaction lifecycle hooks
    const transactionsData = {};

    for (let i = 0; i < alerts.length; i++) {
      if (alerts[i].status.toLowerCase() === constants.PENDING) {
        const regex = new RegExp(alerts[i].id, "g");
        const tradeGroupId = alerts[i].params._tradeGroupId;
        Object.keys(transactionsData).some(key => {
          if (
            transactionsData[key].transactions &&
            transactionsData[key].transactions.length &&
            transactionsData[key].transactions[0].tradeGroupId ===
              tradeGroupId &&
            transactionsData[key].status.toLowerCase() === constants.SUCCESS &&
            alerts[i].params.type.toUpperCase() ===
              constants.PUBLICFILLBESTORDERWITHLIMIT &&
            alerts[i].description === ""
          ) {
            // handle fill only orders alerts updates.
            dispatch(
              updateAlert(alerts[i].id, {
                id: alerts[i].id,
                status: constants.CONFIRMED,
                timestamp:
                  selectCurrentTimestampInSeconds(getState()) ||
                  transactionsData[key].timestamp.timestamp,
                seen: false,
                log: {
                  noFill: true,
                  orderType:
                    alerts[i].params._direction === "0x1"
                      ? constants.BUY
                      : constants.SELL
                }
              })
            );
            return true;
          }
          if (
            key.match(regex) !== null &&
            transactionsData[key].status.toLowerCase() === constants.SUCCESS
          ) {
            const transaction =
              transactionsData[key].transactions &&
              transactionsData[key].transactions[0];
            dispatch(
              updateAlert(
                alerts[i].id,
                packageAlertInfo(
                  alerts[i].id,
                  transactionsData[key].timestamp.timestamp,
                  transaction
                )
              )
            );
            return true;
          }
          if (
            alerts[i].params.type.toUpperCase() === constants.CANCELORDER &&
            transactionsData[key].status.toLowerCase() === constants.SUCCESS
          ) {
            const groupedTransactions = transactionsData[key].transactions;
            groupedTransactions.forEach((transaction: any) => {
              if (
                transaction.meta &&
                transaction.meta.canceledTransactionHash === alerts[i].id
              ) {
                dispatch(
                  updateAlert(
                    alerts[i].id,
                    packageAlertInfo(
                      alerts[i].id,
                      transaction.creationTime,
                      transaction
                    )
                  )
                );
                return true;
              }
            });
          } else if (
            transactionsData[key].status.toLowerCase() === constants.SUCCESS
          ) {
            const groupedTransactions = transactionsData[key].transactions;
            groupedTransactions.forEach((transaction: any) => {
              if (
                transaction.meta &&
                transaction.meta.txhash === alerts[i].id
              ) {
                dispatch(
                  updateAlert(
                    alerts[i].id,
                    packageAlertInfo(
                      alerts[i].id,
                      transaction.creationTime,
                      transaction
                    )
                  )
                );
                return true;
              }
            });
          }
          return false;
        });
      }
    }
  };
}

export function addCriticalAlert(alert: any) {
  return addAlert({
    level: constants.CRITICAL,
    ...alert,
  });
}

export function addAlert(alert: any) {
  return (dispatch: ThunkDispatch<void, any, Action>) => {
    if (alert != null) {
      const { universe } = store.getState() as AppState;
      const callback = (alert: any) => {
        const fullAlert = {
          type: ADD_ALERT,
          data: {
            alert: {
              seen: false,
              level: constants.INFO,
              networkId: getNetworkId(),
              universe: universe.id,
              ...alert,
            },
          },
        };
        return fullAlert;
      };
      dispatch(setAlertText(alert, callback));
    }
  };
}

export function removeAlert(id: string) {
  return {
    type: REMOVE_ALERT,
    data: { id }
  };
}

// export function updateExistingAlert(id, alert) {
//   return (dispatch, getState) => {
//     const callback = alert => {
//       const fullAlert = {
//         type: UPDATE_EXISTING_ALERT,
//         data: {
//           id,
//           alert
//         }
//       };
//       return fullAlert;
//     };
//     return dispatch(setAlertText(alert, callback));
//   };
// }

export function updateAlert(id: string, alert: any) {
  return (dispatch: ThunkDispatch<void, any, Action>): void => {
    alert.id = id;
    if (alert) {
      const { alerts } = store.getState() as AppState;
      if (alert.name === DOINITIALREPORT) {
        dispatch(updateAlert(id, {
          ...alert, 
          params: {
            ...alert.params, 
            preFilled: true
          }, 
          name: CONTRIBUTE
        }));
      }
      const foundAlert = alerts.find(findAlert => findAlert.id === id && findAlert.name === alert.name);
      if (foundAlert) {
        dispatch(removeAlert(id));
        dispatch(addAlert({
          ...alert,
          ...foundAlert,
          name: foundAlert.name !== "" ? foundAlert.name : alert.name,
          params: {
            ...foundAlert.params,
            ...alert.params
          }
        }));
      } else {
        dispatch(addAlert(alert));
      }
    }
  };
}
// We clear by 'alert level'.
// This will not surface in the UI just yet.
export function clearAlerts(alertLevel = constants.INFO) {
  return {
    type: CLEAR_ALERTS,
    data: {
      level: alertLevel
    }
  };
}
