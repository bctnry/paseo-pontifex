import { describe, expect, it } from "vitest";
import { availableStarterTriggerConnections } from "./starter-trigger.js";

describe("starter trigger connections", () => {
  it("returns only concrete connections that can back the generated trigger", () => {
    expect(
      availableStarterTriggerConnections(
        {
          github: [
            {
              slug: "github-getpaseo",
              accountLogin: "getpaseo",
              accountType: "Organization",
              repositories: ["bctnry/paseo-pontifex"],
            },
          ],
          slack: [{ slug: "paseo", teamName: "Paseo" }],
          discord: [{ slug: "paseo-discord", guildName: "Paseo Discord" }],
          daemons: [],
          linear: [],
        },
        "bctnry/paseo-pontifex",
      ),
    ).toEqual([
      {
        id: "github:bctnry/paseo-pontifex",
        label: "GitHub — bctnry/paseo-pontifex",
        provider: "github",
        filters: { connection: "github-getpaseo", repo: "bctnry/paseo-pontifex" },
      },
      {
        id: "slack:paseo",
        label: "Slack — Paseo",
        provider: "slack",
        filters: { connection: "paseo" },
      },
      {
        id: "discord:paseo-discord",
        label: "Discord — Paseo Discord",
        provider: "discord",
        filters: { connection: "paseo-discord" },
      },
    ]);
  });

  it("does not offer GitHub when the current repository is not connected", () => {
    expect(
      availableStarterTriggerConnections(
        {
          github: [
            {
              slug: "github-getpaseo",
              accountLogin: "getpaseo",
              accountType: "Organization",
              repositories: ["getpaseo/hub"],
            },
          ],
          slack: [],
          discord: [],
          daemons: [],
          linear: [],
        },
        "bctnry/paseo-pontifex",
      ),
    ).toEqual([]);
  });
});
