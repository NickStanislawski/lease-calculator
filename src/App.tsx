import { useState, useEffect, useRef, useMemo } from "react";
import type { CSSProperties, FC, KeyboardEvent } from "react";
import { INVENTORY } from "./inventory";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TaxState = "NC" | "SC";
type ProgramId = "GMF" | "Ally" | "USBank";
type RebateType = "lease-only" | "retail-only" | "both";

const BANK_ACQ_FEES: Record<ProgramId, number> = {
  GMF: 695,
  Ally: 750,
  USBank: 725,
};

interface TermRates {
  mf: number;
  res: number;
}

type LeaseProgramTerms = Record<number, TermRates>;

interface Rebate {
  id: string;
  name: string;
  amount: number;
  programs: ProgramId[];
  type: RebateType;
  requiresQualification: boolean;
}

export interface Vehicle {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  msrp: number;
  dealerDiscount: number;
  leasePrograms: Record<ProgramId, LeaseProgramTerms>;
  rebates: Rebate[];
}

interface ProgramDef {
  id: ProgramId;
  name: string;
  isLease: boolean;
  badgeLabel: string;
  featured: boolean;
}

interface ProgramInputs {
  mf: string;
  res: string;
  acq: string;
}

type ProgramInputsState = Record<ProgramId, ProgramInputs>;
type RebateSelections = Record<string, boolean>;

interface ComputedResult {
  id: ProgramId;
  name: string;
  isLease: boolean;
  mf: number;
  res: number;
  acq: number;
  residual: number;
  adjCap: number;
  depreciation: number;
  financeCharge: number;
  basePayment: number;
  withTax: number;
  appliedRebates: Rebate[];
  rebateTotal: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmt = (n: number): string =>
  "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const fmtI = (n: number): string =>
  "$" + Math.round(Math.abs(n)).toLocaleString();

const PROGRAM_DEFS: ProgramDef[] = [
  {
    id: "GMF",
    name: "GM Financial",
    isLease: true,
    badgeLabel: "lease rebates",
    featured: true,
  },
  {
    id: "Ally",
    name: "Ally",
    isLease: false,
    badgeLabel: "retail rebates",
    featured: false,
  },
  {
    id: "USBank",
    name: "US Bank",
    isLease: false,
    badgeLabel: "retail rebates",
    featured: false,
  },
];

const EMPTY_PROGRAM_INPUTS: ProgramInputs = { mf: "", res: "", acq: "" };

const EMPTY_PROGRAMS: ProgramInputsState = {
  GMF: { ...EMPTY_PROGRAM_INPUTS },
  Ally: { ...EMPTY_PROGRAM_INPUTS },
  USBank: { ...EMPTY_PROGRAM_INPUTS },
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, CSSProperties> = {
  wrap: {
    padding: "1.5rem",
    maxWidth: "1200px",
    margin: "0 auto",
    fontFamily: "system-ui, sans-serif",
  },
  sectionLabel: {
    fontSize: "12px",
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--color-text-secondary, #4b5563)",
    marginBottom: "12px",
  },
  card: {
    background: "var(--color-background-primary, #ffffff)",
    border: "1px solid var(--color-border-tertiary, #e5e7eb)",
    borderRadius: "var(--border-radius-lg, 8px)",
    padding: "1.5rem",
    marginBottom: "1.5rem",
    boxShadow: "0 2px 4px rgba(0,0,0,0.04)",
  },
  row: { display: "flex", gap: "36px", flexWrap: "wrap", marginBottom: "16px" },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    flex: 1,
    minWidth: "140px",
    position: "relative",
  },
  fieldLabel: {
    fontSize: "13px",
    fontWeight: 500,
    color: "var(--color-text-secondary, #4b5563)",
  },
  fieldInput: {
    width: "100%",
    height: "40px",
    padding: "0 12px",
    fontSize: "14px",
    border: "1px solid var(--color-border-secondary, #d1d5db)",
    borderRadius: "var(--border-radius-md, 6px)",
    background: "var(--color-background-primary, #ffffff)",
    color: "var(--color-text-primary, #111827)",
    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.05)",
    outline: "none",
    transition: "border-color 0.2s",
  },
  fieldInputReadOnly: {
    background: "var(--color-background-secondary, #f3f4f6)",
    color: "var(--color-text-secondary, #6b7280)",
    boxShadow: "none",
    cursor: "not-allowed",
  },
  vehicleInfo: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    fontSize: "14px",
    color: "var(--color-text-secondary, #4b5563)",
    marginTop: "16px",
    flexWrap: "wrap",
    padding: "12px 16px",
    background: "var(--color-background-secondary, #f9fafb)",
    borderRadius: "var(--border-radius-md, 6px)",
    border: "1px solid var(--color-border-tertiary, #e5e7eb)",
  },
  vehicleInfoB: {
    color: "var(--color-text-primary, #111827)",
    fontWeight: 600,
  },
  vehiclePill: {
    fontSize: "12px",
    fontWeight: 500,
    padding: "4px 10px",
    borderRadius: "20px",
    background: "var(--color-background-info, #eff6ff)",
    color: "var(--color-text-info, #1d4ed8)",
    border: "1px solid #bfdbfe",
  },
  notFound: {
    fontSize: "14px",
    color: "var(--color-text-danger, #b91c1c)",
    marginTop: "12px",
    padding: "12px",
    background: "#fef2f2",
    borderRadius: "var(--border-radius-md, 6px)",
    border: "1px solid #fecaca",
  },
  autocompleteList: {
    position: "absolute",
    top: "calc(100% + 4px)",
    left: 0,
    right: 0,
    zIndex: 20,
    background: "var(--color-background-primary, #ffffff)",
    border: "1px solid var(--color-border-secondary, #d1d5db)",
    borderRadius: "var(--border-radius-md, 6px)",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    maxHeight: "240px",
    overflowY: "auto",
  },
  autocompleteItem: {
    padding: "10px 14px",
    cursor: "pointer",
    fontSize: "14px",
    borderBottom: "1px solid var(--color-border-tertiary, #e5e7eb)",
  },
  autocompleteItemActive: {
    background: "var(--color-background-secondary, #f3f4f6)",
  },
  acStock: { fontWeight: 600, color: "var(--color-text-primary, #111827)" },
  acDesc: {
    color: "var(--color-text-secondary, #6b7280)",
    fontSize: "13px",
    marginTop: "2px",
  },
  progGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "16px",
    marginBottom: "1.5rem",
  },
  progCard: {
    background: "var(--color-background-primary, #ffffff)",
    border: "1px solid var(--color-border-tertiary, #e5e7eb)",
    borderRadius: "var(--border-radius-lg, 8px)",
    padding: "1.25rem",
    boxShadow: "0 2px 4px rgba(0,0,0,0.04)",
  },
  progCardFeatured: {
    border: "2px solid #185FA5",
    boxShadow: "0 4px 8px rgba(24, 95, 165, 0.1)",
  },
  progName: {
    fontSize: "15px",
    fontWeight: 600,
    marginBottom: "12px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
    color: "var(--color-text-primary, #111827)",
  },
  progBadge: {
    fontSize: "11px",
    fontWeight: 500,
    padding: "4px 8px",
    borderRadius: "var(--border-radius-md, 4px)",
    background: "var(--color-background-info, #eff6ff)",
    color: "var(--color-text-info, #1d4ed8)",
    border: "1px solid #bfdbfe",
  },
  progBadgeN: {
    fontSize: "11px",
    fontWeight: 500,
    padding: "4px 8px",
    borderRadius: "var(--border-radius-md, 4px)",
    background: "var(--color-background-secondary, #f3f4f6)",
    color: "var(--color-text-secondary, #4b5563)",
    border: "1px solid #e5e7eb",
  },
  progField: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    marginBottom: "10px",
  },
  progFieldLabel: {
    fontSize: "12px",
    fontWeight: 500,
    color: "var(--color-text-secondary, #4b5563)",
  },
  progFieldInput: {
    height: "36px",
    padding: "0 10px",
    fontSize: "14px",
    border: "1px solid var(--color-border-secondary, #d1d5db)",
    borderRadius: "var(--border-radius-md, 6px)",
    background: "var(--color-background-secondary, #f9fafb)",
    color: "var(--color-text-primary, #111827)",
    width: "100%",
    outline: "none",
    transition: "border-color 0.2s",
    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.02)",
  },
  resultGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "16px",
    marginBottom: "1.5rem",
  },
  metric: {
    background: "var(--color-background-secondary, #f9fafb)",
    border: "1px solid var(--color-border-tertiary, #e5e7eb)",
    borderRadius: "var(--border-radius-md, 8px)",
    padding: "1.5rem 1rem",
    textAlign: "center",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  },
  metricLabel: {
    fontSize: "14px",
    fontWeight: 500,
    color: "var(--color-text-secondary, #4b5563)",
    marginBottom: "8px",
  },
  metricVal: {
    fontSize: "28px",
    fontWeight: 600,
    color: "var(--color-text-primary, #111827)",
  },
  metricValBest: { color: "#185FA5" },
  metricSub: {
    fontSize: "12px",
    color: "var(--color-text-secondary, #6b7280)",
    marginTop: "6px",
  },
  divider: {
    height: "1px",
    background: "var(--color-border-tertiary, #e5e7eb)",
    margin: "2rem 0",
  },
  breakdownHeader: {
    fontSize: "16px",
    fontWeight: 600,
    marginBottom: "16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    color: "var(--color-text-primary, #111827)",
  },
  breakdownTable: {
    width: "100%",
    fontSize: "14px",
    borderCollapse: "collapse",
  },
  tdR: { textAlign: "right", fontWeight: 500 },
  tdSub: {
    color: "var(--color-text-secondary, #6b7280)",
    fontSize: "13px",
    paddingLeft: "16px",
  },
  tdSubR: {
    color: "var(--color-text-secondary, #6b7280)",
    fontSize: "13px",
    textAlign: "right",
  },
  tdTotal: {
    borderTop: "1px solid var(--color-border-tertiary, #d1d5db)",
    paddingTop: "12px",
    marginTop: "4px",
    fontWeight: 600,
    fontSize: "16px",
  },
  taxToggle: { display: "flex", gap: "12px" },
  taxBtnBase: {
    flex: 1,
    height: "42px",
    border: "1px solid var(--color-border-secondary, #d1d5db)",
    borderRadius: "var(--border-radius-md, 6px)",
    background: "var(--color-background-primary, #ffffff)",
    color: "var(--color-text-secondary, #4b5563)",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.2s",
    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
  },
  taxBtnActive: {
    background: "var(--color-background-info, #eff6ff)",
    color: "var(--color-text-info, #1d4ed8)",
    borderColor: "#93c5fd",
    fontWeight: 600,
    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.05)",
  },
  rebateList: { display: "flex", flexDirection: "column", gap: "10px" },
  rebateItem: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "12px 14px",
    border: "1px solid var(--color-border-tertiary, #e5e7eb)",
    borderRadius: "var(--border-radius-md, 6px)",
    cursor: "pointer",
    background: "var(--color-background-primary, #ffffff)",
    boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
  },
  rebateCheckbox: {
    width: "18px",
    height: "18px",
    flexShrink: 0,
    accentColor: "#185FA5",
    cursor: "pointer",
  },
  rebateName: {
    fontSize: "14px",
    fontWeight: 600,
    flex: 1,
    color: "var(--color-text-primary, #111827)",
  },
  rebateNameSub: {
    fontSize: "12px",
    color: "var(--color-text-secondary, #6b7280)",
    fontWeight: 400,
    marginTop: "4px",
  },
  rebateAmt: {
    fontSize: "15px",
    fontWeight: 600,
    color: "var(--color-text-primary, #111827)",
  },
  tag: {
    fontSize: "11px",
    fontWeight: 500,
    padding: "4px 8px",
    borderRadius: "12px",
    background: "var(--color-background-secondary, #f3f4f6)",
    color: "var(--color-text-secondary, #4b5563)",
    border: "1px solid #e5e7eb",
  },
  tagLease: {
    background: "var(--color-background-info, #eff6ff)",
    color: "var(--color-text-info, #1d4ed8)",
    border: "1px solid #bfdbfe",
  },
  tagRetail: {
    background: "var(--color-background-success, #f0fdf4)",
    color: "var(--color-text-success, #155e75)",
    border: "1px solid #bbf7d0",
  },
  emptyMsg: {
    fontSize: "14px",
    color: "var(--color-text-secondary, #6b7280)",
    fontStyle: "italic",
    padding: "1rem 0",
  },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const TypeTag: FC<{ type: RebateType }> = ({ type }) => {
  if (type === "lease-only")
    return (
      <span style={{ ...styles.tag, ...styles.tagLease }}>Lease only</span>
    );
  if (type === "retail-only")
    return (
      <span style={{ ...styles.tag, ...styles.tagRetail }}>Retail only</span>
    );
  return <span style={styles.tag}>Lease &amp; Retail</span>;
};

const programLabel = (p: ProgramId): string => (p === "USBank" ? "US Bank" : p);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const GmLeaseCalculator: FC = () => {
  const [stockInput, setStockInput] = useState<string>("");
  const [activeStock, setActiveStock] = useState<string>("");
  const [term, setTerm] = useState<number>(36);
  const [miles, setMiles] = useState<number>(12000);
  const [discount, setDiscount] = useState<number>(0);
  const [cashdown, setCashdown] = useState<number>(0);
  const [tradeEquity, setTradeEquity] = useState<number>(0);
  const [taxState, setTaxState] = useState<TaxState>("NC");
  const [programInputs, setProgramInputs] =
    useState<ProgramInputsState>(EMPTY_PROGRAMS);
  const [rebateSelections, setRebateSelections] = useState<RebateSelections>(
    {},
  );
  const [showAutocomplete, setShowAutocomplete] = useState<boolean>(false);
  const [acActiveIndex, setAcActiveIndex] = useState<number>(-1);

  const fieldRef = useRef<HTMLDivElement>(null);

  const vehicle: Vehicle | undefined = INVENTORY[activeStock];
  const notFound = activeStock !== "" && !vehicle;

  // ---- autocomplete matches ----
  const matches = useMemo<string[]>(() => {
    const q = stockInput.trim();
    if (!q) return [];
    const upper = q.toUpperCase();
    const found = Object.keys(INVENTORY).filter((stock) =>
      stock.startsWith(upper),
    );
    if (found.length === 1 && found[0] === upper) return [];
    return found;
  }, [stockInput]);

  // close autocomplete on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (fieldRef.current && !fieldRef.current.contains(e.target as Node)) {
        setShowAutocomplete(false);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  // ---- load vehicle when activeStock changes ----
  useEffect(() => {
    const v = INVENTORY[activeStock];
    if (!v) {
      setProgramInputs(EMPTY_PROGRAMS);
      setDiscount(0);
      setRebateSelections({});
      return;
    }
    setDiscount(v.dealerDiscount);

    const selections: RebateSelections = {};
    v.rebates.forEach((r) => {
      selections[r.id] = !r.requiresQualification;
    });
    setRebateSelections(selections);
  }, [activeStock]);

  // ---- load program inputs when stock, term, or miles changes ----
  useEffect(() => {
    const v = INVENTORY[activeStock];
    if (!v) return;

    const resBump = miles === 10000 ? 3 : miles === 12000 ? 2 : 0;
    const getRes = (base: number | undefined) =>
      base ? String(base + resBump) : "";

    const next: ProgramInputsState = {
      GMF: {
        mf: String(v.leasePrograms.GMF[term]?.mf ?? ""),
        res: getRes(v.leasePrograms.GMF[term]?.res),
        acq: String(BANK_ACQ_FEES.GMF),
      },
      Ally: {
        mf: String(v.leasePrograms.Ally[term]?.mf ?? ""),
        res: getRes(v.leasePrograms.Ally[term]?.res),
        acq: String(BANK_ACQ_FEES.Ally),
      },
      USBank: {
        mf: String(v.leasePrograms.USBank[term]?.mf ?? ""),
        res: getRes(v.leasePrograms.USBank[term]?.res),
        acq: String(BANK_ACQ_FEES.USBank),
      },
    };
    setProgramInputs(next);
  }, [activeStock, term, miles]);

  // ---- handlers ----
  const handleStockInputChange = (value: string): void => {
    setStockInput(value);
    setShowAutocomplete(true);
    setAcActiveIndex(-1);
    const upper = value.trim().toUpperCase();
    if (INVENTORY[upper]) {
      setActiveStock(upper);
    } else {
      setActiveStock(upper); // triggers "not found" state too, matches original behavior
    }
  };

  const selectStock = (stock: string): void => {
    setStockInput(stock);
    setActiveStock(stock);
    setShowAutocomplete(false);
  };

  const handleStockKeydown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (!showAutocomplete || matches.length === 0) {
      if (e.key === "Enter") {
        setActiveStock(stockInput.trim().toUpperCase());
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAcActiveIndex((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAcActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (acActiveIndex >= 0) {
        selectStock(matches[acActiveIndex]);
      } else {
        setActiveStock(stockInput.trim().toUpperCase());
        setShowAutocomplete(false);
      }
    } else if (e.key === "Escape") {
      setShowAutocomplete(false);
    }
  };

  const toggleRebate = (id: string): void => {
    setRebateSelections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleProgramInputChange = (
    id: ProgramId,
    field: keyof ProgramInputs,
    value: string,
  ): void => {
    setProgramInputs((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  // ---- calculation ----
  const results = useMemo<ComputedResult[]>(() => {
    if (!vehicle) return [];

    const msrp = vehicle.msrp;
    const totalCapRed = cashdown + tradeEquity;

    return PROGRAM_DEFS.map((def): ComputedResult => {
      const inputs = programInputs[def.id];
      const mf = parseFloat(inputs.mf) || 0;
      const res = parseFloat(inputs.res) || 0;
      const acq = parseFloat(inputs.acq) || 0;

      const appliedRebates = vehicle.rebates.filter(
        (r) => rebateSelections[r.id] && r.programs.includes(def.id),
      );
      const rebateTotal = appliedRebates.reduce((sum, r) => sum + r.amount, 0);

      const residual = msrp * (res / 100);
      const adjCap = msrp - discount - rebateTotal - totalCapRed + acq;
      const depreciation = (adjCap - residual) / term;
      const financeCharge = (adjCap + residual) * mf;
      const basePayment = depreciation + financeCharge;
      const withTax =
        taxState === "NC" ? basePayment * 1.03 : basePayment + 500 / term;

      return {
        id: def.id,
        name: def.name,
        isLease: def.isLease,
        mf,
        res,
        acq,
        residual,
        adjCap,
        depreciation,
        financeCharge,
        basePayment,
        withTax,
        appliedRebates,
        rebateTotal,
      };
    });
  }, [
    vehicle,
    programInputs,
    rebateSelections,
    discount,
    cashdown,
    tradeEquity,
    term,
    taxState,
  ]);

  const minPay = results.length
    ? Math.min(...results.map((r) => r.withTax))
    : 0;

  return (
    <div style={styles.wrap}>
      {/* Vehicle */}
      <div style={styles.sectionLabel}>vehicle</div>
      <div style={styles.card}>
        <div style={styles.row}>
          <div
            style={{ ...styles.field, maxWidth: 220, marginBottom: 0 }}
            ref={fieldRef}
          >
            <label style={styles.fieldLabel}>Stock number</label>
            <input
              type="text"
              style={styles.fieldInput}
              value={stockInput}
              placeholder="Start typing..."
              autoComplete="off"
              onChange={(e) => handleStockInputChange(e.target.value)}
              onFocus={() => setShowAutocomplete(true)}
              onKeyDown={handleStockKeydown}
            />
            {showAutocomplete && matches.length > 0 && (
              <div style={styles.autocompleteList}>
                {matches.map((stock, i) => {
                  const v = INVENTORY[stock];
                  const itemStyle =
                    i === acActiveIndex
                      ? {
                          ...styles.autocompleteItem,
                          ...styles.autocompleteItemActive,
                        }
                      : styles.autocompleteItem;
                  return (
                    <div
                      key={stock}
                      style={itemStyle}
                      onMouseDown={() => selectStock(stock)}
                    >
                      <div style={styles.acStock}>{stock}</div>
                      <div style={styles.acDesc}>
                        {v.year} {v.make} {v.model} {v.trim} — $
                        {v.msrp.toLocaleString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div style={styles.field}>
            <label style={styles.fieldLabel}>MSRP</label>
            <input
              type="text"
              readOnly
              style={{ ...styles.fieldInput, ...styles.fieldInputReadOnly }}
              value={vehicle ? "$" + vehicle.msrp.toLocaleString() : ""}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.fieldLabel}>Term (months)</label>
            <select
              style={styles.fieldInput}
              value={term}
              onChange={(e) => setTerm(parseInt(e.target.value))}
            >
              {([24, 27, 36, 39] as const).map((t) => (
                <option key={t} value={t}>
                  {t} months
                </option>
              ))}
            </select>
          </div>
          <div style={styles.field}>
            <label style={styles.fieldLabel}>Annual mileage</label>
            <select
              style={styles.fieldInput}
              value={miles}
              onChange={(e) => setMiles(parseInt(e.target.value))}
            >
              <option value={10000}>10,000 mi/yr</option>
              <option value={12000}>12,000 mi/yr</option>
              <option value={15000}>15,000 mi/yr</option>
            </select>
          </div>
        </div>

        {vehicle && (
          <div style={styles.vehicleInfo}>
            <span style={styles.vehiclePill}>
              {vehicle.year} {vehicle.make}
            </span>
            <b style={styles.vehicleInfoB}>
              {vehicle.model} {vehicle.trim}
            </b>
            <span>VIN: {vehicle.vin}</span>
          </div>
        )}
        {notFound && (
          <div style={styles.notFound}>
            Stock #{activeStock} not found in inventory
          </div>
        )}
      </div>

      {/* Monthly Payment Comparison */}
      <div style={styles.sectionLabel}>monthly payment comparison</div>
      <div style={styles.resultGrid}>
        {results.map((r) => {
          const isBest = Math.abs(r.withTax - minPay) < 0.01;
          return (
            <div key={r.id} style={styles.metric}>
              <div style={styles.metricLabel}>{r.name}</div>
              <div
                style={{
                  ...styles.metricVal,
                  ...(isBest ? styles.metricValBest : {}),
                }}
              >
                {fmt(r.withTax)}
              </div>
              <div style={styles.metricSub}>
                /mo incl. tax{isBest ? " · lowest" : ""}
              </div>
            </div>
          );
        })}
      </div>

      {/* Deal adjustments + State tax */}
      <div style={styles.row}>
        <div
          style={{ ...styles.card, flex: 1, minWidth: 280, marginBottom: 0 }}
        >
          <div style={styles.sectionLabel}>deal adjustments (apply to all)</div>
          <div style={{ ...styles.row, marginBottom: 0 }}>
            <div style={styles.field}>
              <label style={styles.fieldLabel}>Dealer discount</label>
              <input
                type="number"
                style={styles.fieldInput}
                value={discount}
                step={100}
                onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div style={styles.field}>
              <label style={styles.fieldLabel}>Cash down</label>
              <input
                type="number"
                style={styles.fieldInput}
                value={cashdown}
                step={100}
                onChange={(e) => setCashdown(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div style={styles.field}>
              <label style={styles.fieldLabel}>Trade equity</label>
              <input
                type="number"
                style={styles.fieldInput}
                value={tradeEquity}
                step={100}
                placeholder="can be negative"
                onChange={(e) =>
                  setTradeEquity(parseFloat(e.target.value) || 0)
                }
              />
            </div>
          </div>
        </div>
        <div
          style={{ ...styles.card, flex: 1, minWidth: 280, marginBottom: 0 }}
        >
          <div style={styles.sectionLabel}>state tax</div>
          <div style={styles.taxToggle}>
            {(["NC", "SC"] as TaxState[]).map((state) => (
              <button
                key={state}
                style={
                  taxState === state
                    ? { ...styles.taxBtnBase, ...styles.taxBtnActive }
                    : styles.taxBtnBase
                }
                onClick={() => setTaxState(state)}
              >
                {state === "NC" ? "NC — 3% on payment" : "SC — $500 flat total"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ height: "1rem" }} />

      {/* Available rebates */}
      <div style={styles.sectionLabel}>available rebates</div>
      <div style={styles.card}>
        {vehicle ? (
          <div style={styles.rebateList}>
            {vehicle.rebates.map((r) => (
              <label
                key={r.id}
                style={{
                  ...styles.rebateItem,
                  cursor: r.requiresQualification ? "pointer" : "default",
                  opacity: r.requiresQualification ? 1 : 0.7,
                }}
              >
                <input
                  type="checkbox"
                  style={{
                    ...styles.rebateCheckbox,
                    cursor: r.requiresQualification ? "pointer" : "default",
                  }}
                  checked={!!rebateSelections[r.id]}
                  disabled={!r.requiresQualification}
                  onChange={() => toggleRebate(r.id)}
                />
                <span style={styles.rebateName}>
                  {r.name}
                  <div style={styles.rebateNameSub}>
                    {r.programs.map(programLabel).join(", ")}
                  </div>
                </span>
                <TypeTag type={r.type} />
                <span style={styles.rebateAmt}>{fmtI(r.amount)}</span>
              </label>
            ))}
          </div>
        ) : (
          <div style={styles.emptyMsg}>
            Enter a stock number to see available rebates.
          </div>
        )}
      </div>

      {/* Lease Programs */}
      <div style={styles.sectionLabel}>lease programs</div>
      <div style={styles.progGrid}>
        {PROGRAM_DEFS.map((def) => {
          const cardStyle = def.featured
            ? { ...styles.progCard, ...styles.progCardFeatured }
            : styles.progCard;
          const inputs = programInputs[def.id];
          return (
            <div key={def.id} style={cardStyle}>
              <div style={styles.progName}>
                {def.name}
                <span
                  style={def.isLease ? styles.progBadge : styles.progBadgeN}
                >
                  {def.badgeLabel}
                </span>
              </div>
              <div style={styles.progField}>
                <label style={styles.progFieldLabel}>Money factor</label>
                <input
                  type="number"
                  style={styles.progFieldInput}
                  step={0.00001}
                  value={inputs.mf}
                  onChange={(e) =>
                    handleProgramInputChange(def.id, "mf", e.target.value)
                  }
                />
              </div>
              <div style={styles.progField}>
                <label style={styles.progFieldLabel}>Residual (%)</label>
                <input
                  type="number"
                  style={styles.progFieldInput}
                  step={0.5}
                  value={inputs.res}
                  onChange={(e) =>
                    handleProgramInputChange(def.id, "res", e.target.value)
                  }
                />
              </div>
              <div style={styles.progField}>
                <label style={styles.progFieldLabel}>Acq. fee ($)</label>
                <input
                  type="number"
                  style={styles.progFieldInput}
                  step={25}
                  value={inputs.acq}
                  onChange={(e) =>
                    handleProgramInputChange(def.id, "acq", e.target.value)
                  }
                />
              </div>
            </div>
          );
        })}
      </div>

      <div style={styles.divider} />

      {/* Detailed Breakdown */}
      {/* {results.length > 0 && (
        <>
          <div style={styles.sectionLabel}>detailed breakdown</div>
          {results.map((r) => (
            <div key={r.id} style={{ ...styles.card, marginBottom: 12 }}>
              <div style={styles.breakdownHeader}>
                <span>{r.name}</span>
                <span style={{ fontSize: 18, fontWeight: 500 }}>
                  {fmt(r.withTax)}
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 400,
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    /mo
                  </span>
                </span>
              </div>
              <table style={styles.breakdownTable}>
                <tbody>
                  <tr>
                    <td>MSRP</td>
                    <td style={styles.tdR}>{fmtI(vehicle!.msrp)}</td>
                  </tr>
                  <tr>
                    <td>Dealer discount</td>
                    <td style={styles.tdR}>− {fmtI(discount)}</td>
                  </tr>
                  <tr>
                    <td>Rebates applied</td>
                    <td style={styles.tdR}>− {fmtI(r.rebateTotal)}</td>
                  </tr>
                  {r.appliedRebates.map((rb) => (
                    <tr key={rb.id}>
                      <td style={styles.tdSub}>{rb.name}</td>
                      <td style={styles.tdSubR}>− {fmtI(rb.amount)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td>Cash down</td>
                    <td style={styles.tdR}>− {fmtI(cashdown)}</td>
                  </tr>
                  {tradeEquity !== 0 && (
                    <tr>
                      <td>Trade equity</td>
                      <td style={styles.tdR}>
                        {tradeEquity >= 0 ? "− " : "+ "}
                        {fmtI(tradeEquity)}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td>Acquisition fee</td>
                    <td style={styles.tdR}>+ {fmtI(r.acq)}</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Adjusted cap cost</strong>
                    </td>
                    <td style={styles.tdR}>
                      <strong>{fmtI(r.adjCap)}</strong>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ paddingTop: 8 }}>
                      Residual ({r.res}% of MSRP)
                    </td>
                    <td style={{ ...styles.tdR, paddingTop: 8 }}>
                      {fmtI(r.residual)}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ paddingTop: 8 }}>Depreciation / mo</td>
                    <td style={{ ...styles.tdR, paddingTop: 8 }}>
                      {fmt(r.depreciation)}
                    </td>
                  </tr>
                  <tr>
                    <td>
                      Finance charge / mo ({(r.mf * 2400).toFixed(2)}% APR
                      equiv.)
                    </td>
                    <td style={styles.tdR}>{fmt(r.financeCharge)}</td>
                  </tr>
                  <tr>
                    <td>Base payment</td>
                    <td style={styles.tdR}>{fmt(r.basePayment)}</td>
                  </tr>
                  <tr>
                    <td style={styles.tdTotal}>With tax ({taxNote})</td>
                    <td style={{ ...styles.tdTotal, textAlign: "right" }}>
                      {fmt(r.withTax)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
        </>
      )} */}
    </div>
  );
};

export default GmLeaseCalculator;
