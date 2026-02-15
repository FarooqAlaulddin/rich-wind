import ApiCard from "./ApiCard.jsx";

const API_ENDPOINTS = [
  { kind: "compile", requestEndpoint: "POST /api/compile", responseEndpoint: "/api/compile" },
  { kind: "cache", requestEndpoint: "GET /api/css", responseEndpoint: "/api/css" },
  { kind: "project", requestEndpoint: "GET /api/projects/:id/css", responseEndpoint: "/api/projects/:id/css" },
  { kind: "suggest", requestEndpoint: "POST /api/suggest", responseEndpoint: "/api/suggest" },
];

export default function ApiTelemetry() {
  return (
    <section className="api-showcase">
      <div className="api-header">
        <div>
          <div className="api-title">Live API Telemetry</div>
          <div className="api-subtitle">
            Real-time request/response snapshots from the Rich Wind core.
          </div>
        </div>
        <span className="api-status api-live">
          <span className="api-live-dot" />
          Watching
        </span>
      </div>

      <div className="api-grid">
        <div>
          <div className="api-column-title">Requests</div>
          {API_ENDPOINTS.map(({ kind, requestEndpoint }) => (
            <ApiCard key={kind} kind={kind} role="request" endpoint={requestEndpoint}>
              Awaiting {kind} request.
            </ApiCard>
          ))}
        </div>

        <div>
          <div className="api-column-title">Responses</div>
          {API_ENDPOINTS.map(({ kind, responseEndpoint }) => (
            <ApiCard key={kind} kind={kind} role="response" endpoint={responseEndpoint}>
              Awaiting {kind} response.
            </ApiCard>
          ))}
        </div>
      </div>
    </section>
  );
}
