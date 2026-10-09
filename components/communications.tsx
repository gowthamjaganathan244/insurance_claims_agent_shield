"use client";
import { useState } from "react";
import { templates } from "@/lib/data";
import { seed } from "@/lib/claims";
import { Tabs } from "./tabs";
import { Numbers } from "./ui";
function Message({ text }: { text: string }) {
  return (
    <div className="msg">
      {text
        .split(/(\{\{\w+\}\})/g)
        .map((part, index) =>
          part.startsWith("{{") && part.endsWith("}}") ? (
            <mark key={index}>{part.slice(2, -2)}</mark>
          ) : (
            part
          ),
        )}
    </div>
  );
}
export function Communications() {
  const [selected, setSelected] = useState(0);
  const [tab, setTab] = useState(0);
  const [drafts, setDrafts] = useState(
    templates.map((template) => template[2]),
  );
  const template = templates[selected];
  const text = drafts[selected];
  const variables = [
    ...new Set([...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1])),
  ];
  const random = seed(13 * template[0].length);
  const sent = Math.round(900 + 2400 * random());
  const failed = Math.round(sent * (0.004 + 0.012 * random()));
  return (
    <div className="tpl">
      <div>
        {templates.map((template, index) => (
          <button
            key={template[0]}
            className="row template-row"
            aria-pressed={index === selected}
            onClick={() => {
              setSelected(index);
              setTab(0);
            }}
          >
            <span>
              <span className="t">{template[0]}</span>
              <span className="s">{template[1]}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="glass lq">
        <Tabs
          label="Message template details"
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
              <Message text={text} />
              <label
                className="dim sm"
                htmlFor="message-text"
                style={{ display: "block", marginTop: 20 }}
              >
                Message text
              </label>
              <textarea
                id="message-text"
                value={text}
                maxLength={10000}
                onChange={(event) =>
                  setDrafts((current) =>
                    current.map((draft, index) =>
                      index === selected ? event.target.value : draft,
                    ),
                  )
                }
              />
            </>
          )}
          {tab === 1 && (
            <>
              {variables.map((variable) => (
                <span className="vr" key={variable}>
                  {variable}
                </span>
              ))}
              <p className="dim sm">
                Filled from the claim record when the message is sent.
              </p>
            </>
          )}
          {tab === 2 && (
            <ul className="tl">
              {[
                ["Shortened the opening line", "M. Chen", "Today"],
                ["Added tracking link", "R. Patel", "3 days ago"],
                ["Plain-language rewrite", "M. Chen", "2 weeks ago"],
              ].map(([description, author, when], index) => (
                <li className={index === 0 ? "ok" : ""} key={description}>
                  <b>
                    v{4 - index} {description}
                  </b>
                  <small>
                    {author}, {when}
                  </small>
                </li>
              ))}
            </ul>
          )}
          {tab === 3 && (
            <>
              <Numbers
                items={[
                  [sent.toLocaleString("en-AU"), "sent, last 7 days"],
                  [
                    `${(Math.round(1000 * (1 - failed / sent)) / 10).toFixed(1)}%`,
                    "delivered",
                  ],
                  [failed, "failed"],
                ]}
              />
              <p className="dim sm">
                Channel: {template[1]}. Failed sends retry for 24 hours.
              </p>
            </>
          )}
          {tab === 4 && (
            <ul className="tl">
              {[
                ["Version 4 published", "M. Chen", "09:12 today"],
                ["Reviewed by compliance", "L. Hassan", "Yesterday 16:40"],
                ["Version 3 retired", "System", "Yesterday 16:41"],
              ].map(([description, author, when], index) => (
                <li key={description} className={index === 0 ? "ok" : ""}>
                  <b>{description}</b>
                  <small>
                    {author}, {when}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </Tabs>
      </div>
    </div>
  );
}
