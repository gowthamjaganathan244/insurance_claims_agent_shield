"use client";
import { useState } from "react";
import { Tabs } from "./tabs";
export function Communications() {
  const [tab, setTab] = useState(0);
  return (
    <div className="tpl">
      <div className="pane">
        <h2>Email templates</h2>
        <p className="dim">Not connected</p>
        <p className="dim">No template content has been loaded.</p>
      </div>
      <div className="glass lq">
        <Tabs
          label="Email data availability"
          labels={[
            "Preview",
            "Variables",
            "Version history",
            "Delivery status",
            "Audit trail",
          ]}
          active={tab}
          onChange={setTab}
        >
          {tab === 0 && (
            <>
              <h3>Template preview unavailable</h3>
              <p className="dim">
                Template reading and editing are not connected.
              </p>
            </>
          )}
          {tab === 1 && (
            <p className="dim">
              Template variables unavailable until the stored template is
              retrieved.
            </p>
          )}
          {tab === 2 && (
            <p className="dim">Template version history not connected.</p>
          )}
          {tab === 3 && (
            <>
              <h3>Delivery tracking not configured</h3>
              <p className="dim">
                No SES configuration sets were found in the supplied inventory.
                Current configuration has not been refreshed. Sent, delivered,
                bounced and complaint counts are unavailable.
              </p>
            </>
          )}
          {tab === 4 && (
            <p className="dim">
              Message activity and audit history not connected.
            </p>
          )}
        </Tabs>
      </div>
    </div>
  );
}
