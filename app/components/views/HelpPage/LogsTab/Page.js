import { FormattedMessage as T } from "react-intl";
import { Subtitle } from "shared";
import "style/Logs.less";

const Logs = ({
  showEcrdLogs,
  showEacrwalletLogs,
  onShowEcrdLogs,
  onShowEacrwalletLogs,
  onHideEcrdLogs,
  onHideEacrwalletLogs,
  eacrdLogs,
  eacrwalletLogs,
  isDaemonRemote,
  isDaemonStarted,
  walletReady,
  eacreditonLogs,
  showEacreditonLogs,
  onShowEacreditonLogs,
  onHideEacreditonLogs,
  lnActive,
  lnConnectAttempt,
  lnStartAttempt,
  dcrlndLogs,
  showDcrlndLogs,
  onShowDcrlndLogs,
  onHideDcrlndLogs
}
) => (
  <>
    <Subtitle title={<T id="logs.subtitle" m="System Logs"/>} />
    {!isDaemonRemote && isDaemonStarted ?
      !showEcrdLogs ?
        <div className="log-area hidden">
          <div className="log-area-title hidden" onClick={onShowEcrdLogs}>
            <T id="help.logs.eacrd" m="eacrd" />
          </div>
        </div>:
        <div className="log-area expanded">
          <div className="log-area-title expanded" onClick={onHideEcrdLogs}>
            <T id="help.logs.eacrd" m="eacrd" />
          </div>
          <div className="log-area-logs">
            <textarea rows="30" value={eacrdLogs} disabled />
          </div>
        </div> :
      <div/>
    }
    {!walletReady ? null : !showEacrwalletLogs ?
      <div className="log-area hidden">
        <div className="log-area-title hidden" onClick={onShowEacrwalletLogs}>
          <T id="help.logs.eacrwallet" m="eacrwallet" />
        </div>
      </div>:
      <div className="log-area expanded">
        <div className="log-area-title expanded" onClick={onHideEacrwalletLogs}>
          <T id="help.logs.eacrwallet" m="eacrwallet" />
        </div>
        <div className="log-area-logs">
          <textarea rows="30" value={eacrwalletLogs} disabled />
        </div>
      </div>
    }
    {!showEacreditonLogs ?
      <div className="log-area hidden">
        <div className="log-area-title hidden" onClick={onShowEacreditonLogs}>
          <T id="help.logs.eacrediton" m="eacrediton" />
        </div>
      </div>:
      <div className="log-area expanded">
        <div className="log-area-title expanded" onClick={onHideEacreditonLogs}>
          <T id="help.logs.eacrediton" m="eacrediton" />
        </div>
        <div className="log-area-logs">
          <textarea rows="30" value={eacreditonLogs} disabled />
        </div>
      </div>
    }
    {(!lnActive && !lnConnectAttempt && !lnStartAttempt) ? null : !showDcrlndLogs ?
      <div className="log-area hidden">
        <div className="log-area-title hidden" onClick={onShowDcrlndLogs}>
          <T id="help.logs.dcrlnd" m="dcrlnd" />
        </div>
      </div>:
      <div className="log-area expanded">
        <div className="log-area-title expanded" onClick={onHideDcrlndLogs}>
          <T id="help.logs.dcrlnd" m="dcrlnd" />
        </div>
        <div className="log-area-logs">
          <textarea rows="30" value={dcrlndLogs} disabled />
        </div>
      </div>
    }

  </>
);

export default Logs;
