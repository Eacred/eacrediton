import Logs from "./Page";
import { getEcrdLogs, getEacrwalletLogs, getEacreditonLogs, getDcrlndLogs } from "wallet";
import { logging } from "connectors";
import { DescriptionHeader } from "layout";
import { FormattedMessage as T } from "react-intl";
import ReactTimeout from "react-timeout";

export const LogsTabHeader = () =>
  <DescriptionHeader
    description={<T id="help.description.logs" m="Please find your current logs below to look for any issue or error you are having." />}
  />;
@autobind
class LogsTabBody extends React.Component {
  constructor(props) {
    super(props);
    this.state = this.getInitialState();
  }

  componentDidMount() {
    this.getLogs();
  }

  componentDidUpdate() {
    if(this.state.interval) {
      return;
    }
    const interval = this.props.setInterval(() => {
      this.getLogs();
    }, 2000);
    this.setState({ interval });
  }

  componentWillUnmount() {
    this.props.clearInterval(this.state.interval);
  }

  getInitialState() {
    return {
      interval: null,
      eacrdLogs: "",
      eacrwalletLogs: "",
      eacreditonLogs: "",
      dcrlndLogs: "",
      showEcrdLogs: false,
      showEacrwalletLogs: false,
      showEacreditonLogs: false,
      showDcrlndLogs: false
    };
  }

  render() {
    const { onShowEacreditonLogs, onShowEcrdLogs, onShowEacrwalletLogs,
      onHideEacreditonLogs, onHideEcrdLogs, onHideEacrwalletLogs, onShowDcrlndLogs,
      onHideDcrlndLogs
    } = this;
    return (
      <Logs
        {...{
          ...this.props,
          ...this.state,
          onShowEacreditonLogs,
          onShowEcrdLogs,
          onShowEacrwalletLogs,
          onShowDcrlndLogs,
          onHideEacreditonLogs,
          onHideEcrdLogs,
          onHideEacrwalletLogs,
          onHideDcrlndLogs
        }}
      />
    );
  }

  getLogs() {
    return Promise
      .all([ getEcrdLogs(), getEacrwalletLogs(), getEacreditonLogs(), getDcrlndLogs() ])
      .then(([ rawEcrdLogs, rawEacrwalletLogs, eacreditonLogs, dcrlndLogs ]) => {
        const eacrdLogs = Buffer.from(rawEcrdLogs).toString("utf8");
        const eacrwalletLogs = Buffer.from(rawEacrwalletLogs).toString("utf8");
        if ( eacrdLogs !== this.state.eacrdLogs ) {
          this.setState({ eacrdLogs });
        }
        if ( eacrwalletLogs !== this.state.eacrwalletLogs ) {
          this.setState({ eacrwalletLogs });
        }
        if ( eacreditonLogs !== this.state.eacreditonLogs ) {
          this.setState({ eacreditonLogs });
        }
        if ( dcrlndLogs !== this.state.dcrlndLogs ) {
          this.setState({ dcrlndLogs });
        }
      });
  }

  onShowEacreditonLogs() {
    this.setState({ showEacreditonLogs: true });
  }

  onHideEacreditonLogs() {
    this.setState({ showEacreditonLogs: false });
  }

  onShowEcrdLogs() {
    this.setState({ showEcrdLogs: true });
  }

  onHideEcrdLogs() {
    this.setState({ showEcrdLogs: false });
  }

  onShowEacrwalletLogs() {
    this.setState({ showEacrwalletLogs: true });
  }

  onHideEacrwalletLogs() {
    this.setState({ showEacrwalletLogs: false });
  }

  onShowDcrlndLogs() {
    this.setState({ showDcrlndLogs: true });
  }

  onHideDcrlndLogs() {
    this.setState({ showDcrlndLogs: false });
  }
}

export const LogsTab = ReactTimeout(logging(LogsTabBody));
