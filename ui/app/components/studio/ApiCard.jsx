export default function ApiCard({ kind, role, endpoint, children }) {
  const isRequest = role === "request";

  return (
    <div className="api-card" data-api-kind={kind} data-api-role={role}>
      <div className="api-card-header">
        <span className="api-endpoint">{endpoint}</span>
        <div className="api-card-actions">
          {isRequest ? (
            <>
              <span id={`api-${kind}-time`} className="api-time">Idle</span>
              <button type="button" className="api-action" data-api-action="curl" data-api-target={`api-${kind}-request`}>Curl</button>
              <button type="button" className="api-action" data-api-action="copy" data-api-target={`api-${kind}-request`}>Copy</button>
            </>
          ) : (
            <span id={`api-${kind}-status`} className="api-status">&mdash;</span>
          )}
        </div>
      </div>
      <pre id={`api-${kind}-${role}`} className="api-code">
        {children}
      </pre>
    </div>
  );
}
