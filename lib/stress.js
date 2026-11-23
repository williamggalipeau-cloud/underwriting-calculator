// Stress Testing: applies the risk-factor sliders to a deal's inputs.
export function applyStress(inputs, factors) {
  const stressed = { ...inputs };

  // ── Vacancy increase ──────────────────────────────────────────────────────
  // Asset-level (no-unit path) + unit fallbacks (renewal prob / downtime)
  stressed.vacancyPct = (inputs.vacancyPct ?? 0) + factors.vacancyDelta;
  // Reduce renewal probability (unit fallback) proportionally
  stressed.renewalProbabilityPct = Math.max(
    0,
    (inputs.renewalProbabilityPct ?? 60) - factors.vacancyDelta * 2
  );
  // Increase downtime between leases
  stressed.downtimeBetweenLeases =
    (inputs.downtimeBetweenLeases ?? 2) + factors.vacancyDelta * 0.15;

  // ── Rent escalation reduction ─────────────────────────────────────────────
  // Market rent growth; it can go below zero (rents falling) when the cut is
  // larger than the base growth (user, 11/23: cuts above 5% allowed). Rent
  // bumps written into existing leases are unchanged.
  stressed.annualRentEscalationPct = (inputs.annualRentEscalationPct ?? 3) - factors.rentEscDelta;

  // ── Interest rate rise (bps → %) ─────────────────────────────────────────
  const rateDeltaPct = factors.rateDelta / 100;
  if (inputs.floatingRate) {
    stressed.spreadPct = (inputs.spreadPct ?? 0) + rateDeltaPct;
  } else {
    stressed.interestRatePct = (inputs.interestRatePct ?? 0) + rateDeltaPct;
  }

  // ── Operating expense overrun ─────────────────────────────────────────────
  const opexMult = 1 + factors.opexDelta / 100;
  stressed.realEstateTaxPSF = (inputs.realEstateTaxPSF ?? 0) * opexMult;
  stressed.insurancePSF = (inputs.insurancePSF ?? 0) * opexMult;
  stressed.utilitiesPSF = (inputs.utilitiesPSF ?? 0) * opexMult;
  stressed.maintenancePSF = (inputs.maintenancePSF ?? 0) * opexMult;
  stressed.janitorialPSF = (inputs.janitorialPSF ?? 0) * opexMult;
  stressed.managementFeePct = (inputs.managementFeePct ?? 0) * opexMult;
  stressed.capitalReservesPSF = (inputs.capitalReservesPSF ?? 0) * opexMult;
  stressed.leasingFeesPSF = (inputs.leasingFeesPSF ?? 0) * opexMult;

  // ── Direct-NOI deals: rent-roll levers don't drive NOI, so apply the
  // vacancy shock as a % cut to NOI and the escalation cut to NOI growth.
  // (Opex overrun has no rent-roll expenses to act on in this mode.)
  if (inputs.noiOverrideEnabled) {
    stressed.noiYear1 = (inputs.noiYear1 ?? 0) * (1 - factors.vacancyDelta / 100);
    stressed.noiGrowthPct = (inputs.noiGrowthPct ?? 0) - factors.rentEscDelta;
  }
  stressed.capexBudget = (inputs.capexBudget ?? 0) * (1 + factors.constructionDelta / 100);

  // ── Exit cap rate expansion ───────────────────────────────────────────────
  stressed.exitCapRatePct = (inputs.exitCapRatePct ?? 0) + factors.exitCapDelta;

  // ── Construction / TI overrun ─────────────────────────────────────────────
  const conMult = 1 + factors.constructionDelta / 100;
  if (inputs.constructionCosts) {
    const cc = { ...inputs.constructionCosts };
    const psf_keys = [
      "demolition", "partitionWalls", "electrical", "plumbing", "hvac",
      "flooring", "painting", "lighting", "doorsHardware", "overheadDoors",
      "landscaping", "roofing", "signage", "miscConstruction",
    ];
    psf_keys.forEach((k) => { if (cc[k] != null) cc[k] *= conMult; });
    stressed.constructionCosts = cc;
  }
  stressed.tiPerSFNew = (inputs.tiPerSFNew ?? 0) * conMult;
  stressed.tiPerSFRenewal = (inputs.tiPerSFRenewal ?? 0) * conMult;

  return stressed;
}
