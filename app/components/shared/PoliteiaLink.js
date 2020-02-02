import ExternalLink from "./ExternalLink";

export default ({ children, path, className }) => (
  <ExternalLink
    href={"https://proposals.eacred.org" + (path||"")}
    hrefTestNet={"https://test-proposals.eacred.org" + (path||"")}
    className={className}
  >
    {children}
  </ExternalLink>
);
