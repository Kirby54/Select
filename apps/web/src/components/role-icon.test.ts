import { describe, expect, it } from "vitest";
import { Calculator, Code, Cpu, Crown, Handshake, Headset, Inbox, Megaphone, Workflow } from "lucide-react";

import { roleIcon } from "./domain";

describe("roleIcon", () => {
  it("reads the role in English, French or German", () => {
    expect(roleIcon("CEO")).toBe(Crown);
    expect(roleIcon("Président-directeur général")).toBe(Crown);
    expect(roleIcon("CTO")).toBe(Cpu);
    expect(roleIcon("Software Engineer (Codex)")).toBe(Code);
    expect(roleIcon("Développeuse front-end")).toBe(Code);
    expect(roleIcon("Accounting")).toBe(Calculator);
    expect(roleIcon("Chief Marketing Officer")).toBe(Megaphone);
    expect(roleIcon("Rédige les publications")).toBe(Megaphone);
    expect(roleIcon("Répond aux clients")).toBe(Headset);
    expect(roleIcon("Beantwortet Kundenfragen")).toBe(Headset);
    expect(roleIcon("Prépare les devis")).toBe(Handshake);
    expect(roleIcon("Erstellt Angebote")).toBe(Handshake);
    expect(roleIcon("Tri des e-mails entrants")).toBe(Inbox);
    expect(roleIcon("Operations lead")).toBe(Workflow);
  });

  it("keeps the initials when the role says nothing it knows", () => {
    expect(roleIcon("Gardien du phare")).toBeNull();
    expect(roleIcon(undefined)).toBeNull();
  });
});
