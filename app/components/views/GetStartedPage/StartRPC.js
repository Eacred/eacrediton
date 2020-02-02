import { KeyBlueButton } from "buttons";
import { ShowError } from "shared";
import { FormattedMessage as T } from "react-intl";
import { getEcrdLastLogLine, getEacrwalletLastLogLine } from "wallet";
import ReactTimeout from "react-timeout";
import "style/GetStarted.less";

function parseLogLine(line) {
  const res = /^[\d :\-.]+ \[...\] (.+)$/.exec(line);
  return res ? res[1] : "";
}

const LastLogLinesFragment = ({ lastEcrdLogLine, lastEacrwalletLogLine }) => (
  <div className="get-started-last-log-lines">
    <div className="last-eacrd-log-line">{lastEcrdLogLine}</div>
    <div className="last-eacrwallet-log-line">{lastEacrwalletLogLine}</div>
  </div>
);

const StartupErrorFragment = ({ onRetryStartRPC }) => (
  <div className="advanced-page-form">
    <div className="advanced-daemon-row">
      <ShowError className="get-started-error" error="Connection to eacrd failed, please try and reconnect." />
    </div>
    <div className="loader-bar-buttons">
      <KeyBlueButton className="get-started-rpc-retry-button" onClick={onRetryStartRPC}>
        <T id="getStarted.retryBtn" m="Retry" />
      </KeyBlueButton>
    </div>
  </div>
);

@autobind
class StartRPCBody extends React.Component {

  constructor(props) {
    super(props);
    this.state = { lastEcrdLogLine: "", lastEacrwalletLogLine: "" };
  }

  componentDidMount() {
    this.props.setInterval(() => {
      Promise
        .all([ getEcrdLastLogLine(), getEacrwalletLastLogLine() ])
        .then(([ eacrdLine, eacrwalletLine ]) => {
          const lastEcrdLogLine = parseLogLine(eacrdLine);
          const lastEacrwalletLogLine = parseLogLine(eacrwalletLine);
          if ( lastEcrdLogLine !== this.state.lastEcrdLogLine ||
              lastEacrwalletLogLine !== this.state.lastEacrwalletLogLine)
          {
            this.setState({ lastEcrdLogLine, lastEacrwalletLogLine });
          }
        });
    }, 2000);
  }

  render () {
    const { startupError, getCurrentBlockCount } = this.props;

    return (
      <>
        {!getCurrentBlockCount && <LastLogLinesFragment {...this.state} />}
        {startupError && <StartupErrorFragment {...this.props} />}
      </>
    );
  }
}

export default ReactTimeout(StartRPCBody);
