import { HostRouteBootstrapBoundary } from "@/components/host-route-bootstrap-boundary";
import { SessionsScreen } from "@/screens/sessions-screen";

export default function ArchivedSessionsRoute() {
  return (
    <HostRouteBootstrapBoundary>
      <SessionsScreen variant="archived" />
    </HostRouteBootstrapBoundary>
  );
}
