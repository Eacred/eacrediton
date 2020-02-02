import { FormattedMessage as T } from "react-intl";
import { shutdownPage } from "connectors";
import { EacredLoading } from "indicators";
import "style/Layout.less";

class ShutdownAppPage extends React.Component{
  componentDidMount() {
    this.props.cleanShutdown();
  }

  render() {
    return (
      <div className="page-body getstarted">
        <EacredLoading  className="get-started-loading" />
        <div className="shutdown-text"><T id="shutdown.header.title" m="Shutting down Eacrediton" /></div>
      </div>
    );
  }
}

export default shutdownPage(ShutdownAppPage);
