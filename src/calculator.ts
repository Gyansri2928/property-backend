// src/calculator.ts

// ===================== 1. TYPE DEFINITIONS =====================

export interface Assumptions {
    homeLoanRate: number;
    homeLoanTerm: number;
    homeLoanShare: number;
    homeLoanStartMonth: number;
    homeLoanStartMode: string;
    personalLoan1Rate: number;
    personalLoan1Term: number;
    personalLoan1StartMonth: number;
    personalLoan1Share: number;
    personalLoan2Rate: number;
    personalLoan2Term: number;
    personalLoan2StartMonth: number;
    personalLoan2Share: number;
    downPaymentShare: number;
    investmentPeriod: number;
    clpDurationYears: number;
    bankDisbursementStartMonth: number;
    bankDisbursementInterval: number;
    lastBankDisbursementMonth: number;
    holdingPeriodUnit: string;
}
const formatCurrency = (value: number): string => {
    if (value === undefined || value === null || isNaN(value)) return "₹0";
    return "₹" + Math.round(value).toLocaleString('en-IN');
};

export interface PropertyInput {
    id: number;
    name: string;
    location: string;
    size: number;
    possessionMonths: number;
}

export interface ScenarioInput {
    purchasePrice: number;
    otherCharges: number;
    stampDuty: number;
    gstPercentage: number;
    paymentPlan: string;
    assumptions: Assumptions;
    selectedProperty: PropertyInput;
    selectedExitPrice: number;
    scenarioExitPrices: number[];
}

export interface LedgerRow {
    month: number;
    disbursement: number;
    activeSlabs: number | string;
    cumulativeDisbursement: number;
    outstandingBalance: number;
    hlComponent: number;
    interestPart: number;
    principalPart: number;
    isFullEMI: boolean;
    pl1: number;
    totalOutflow: number;
}

export interface IdcReportRow {
    slabNo: number;
    releaseMonth: number;
    amount: number;
    monthlyInterest: number;
    cumulativeMonthlyInterest: number;
    duration: number;
    totalCostForSlab: number;
}

export interface IdcReport {
    grandTotalInterest: number;
    minMonthlyInterest: number;
    maxMonthlyInterest: number;
    schedule: IdcReportRow[];
    cutoffMonth: number;
}

// ===================== 2. HELPER FUNCTIONS =====================

const getSafeValue = (value: any): number => {
    if (value === '' || value === null || value === undefined || isNaN(Number(value))) return 0;
    return parseFloat(value);
};

const calculateEMI = (principal: number, annualRate: number, years: number): number => {
    if (!principal || principal === 0) return 0;
    if (!years || years <= 0) return 0;
    if (!annualRate || annualRate === 0) return principal / (years * 12);

    const monthlyRate = annualRate / (12 * 100);
    const months = years * 12;
    return principal * monthlyRate * Math.pow(1 + monthlyRate, months) / (Math.pow(1 + monthlyRate, months) - 1);
};

const calculateOutstandingAfterPayments = (principal: number, annualRate: number, years: number, paymentsMade: number): number => {
    if (!principal || principal === 0) return 0;
    if (paymentsMade <= 0) return principal;
    const totalMonths = years * 12;
    if (paymentsMade >= totalMonths) return 0;
    if (!annualRate || annualRate === 0) {
        const monthlyPrincipal = principal / totalMonths;
        return Math.max(0, principal - (monthlyPrincipal * paymentsMade));
    }
    const monthlyRate = annualRate / (12 * 100);
    const outstanding = principal * (Math.pow(1 + monthlyRate, totalMonths) - Math.pow(1 + monthlyRate, paymentsMade)) / (Math.pow(1 + monthlyRate, totalMonths) - 1);
    return Math.max(0, outstanding);
};

const calculateTotalInterestPaid = (principal: number, annualRate: number, years: number, paymentsMade: number): number => {
    if (!principal || principal === 0 || paymentsMade <= 0) return 0;
    const monthlyRate = annualRate / (12 * 100);
    const emi = calculateEMI(principal, annualRate, years);
    let interestPaid = 0;
    let remainingPrincipal = principal;
    for (let i = 0; i < paymentsMade; i++) {
        const interestForMonth = remainingPrincipal * monthlyRate;
        const principalForMonth = emi - interestForMonth;
        interestPaid += interestForMonth;
        remainingPrincipal -= principalForMonth;
    }
    return interestPaid;
};


// ===================== 3. CORE LOGIC =====================

const calculateMetricsForPrice = (data: ScenarioInput, targetExitPrice: number) => {
    const { purchasePrice, otherCharges, stampDuty, gstPercentage, assumptions, paymentPlan, selectedProperty } = data;

    // --- 1. Basic Setup ---
    const propertySize = getSafeValue(selectedProperty.size);
    let totalHoldingMonths: number;
    if (assumptions.holdingPeriodUnit === 'months') {
        totalHoldingMonths = getSafeValue(assumptions.investmentPeriod);
    } else {
        totalHoldingMonths = getSafeValue(assumptions.investmentPeriod) * 12;
    }
    const valYears = totalHoldingMonths / 12;
    const displayYears = Math.round(valYears * 100) / 100;
    const possessionMonths = getSafeValue(selectedProperty.possessionMonths);

    const baseCost = propertySize * getSafeValue(purchasePrice);
    const agreementValue = baseCost;
    const stampDutyCost = agreementValue * (getSafeValue(stampDuty) / 100);
    const gstCost = agreementValue * (getSafeValue(gstPercentage) / 100);
    const totalCost = baseCost;

    // --- 2. Loan Shares ---
    let homeLoanShare = 0, personalLoan1Share = 0, personalLoan2Share = 0, downPaymentShare = 0;
    if (paymentPlan === 'clp') {
        homeLoanShare = 80; personalLoan1Share = 10; personalLoan2Share = 10; downPaymentShare = 0;
    } else if (paymentPlan === '20-80') {
        homeLoanShare = 80; personalLoan1Share = 20; personalLoan2Share = 0; downPaymentShare = 0;
    } else if (paymentPlan === '40-60') {
        homeLoanShare = 60; personalLoan1Share = 40; personalLoan2Share = 0; downPaymentShare = 0;
    } else if (paymentPlan === 'rtm') {
        homeLoanShare = 80; personalLoan1Share = 20; personalLoan2Share = 0; downPaymentShare = 0;
    } else {
        personalLoan1Share = getSafeValue(assumptions.personalLoan1Share);
        personalLoan2Share = getSafeValue(assumptions.personalLoan2Share);
        downPaymentShare = getSafeValue(assumptions.downPaymentShare);
        homeLoanShare = getSafeValue(assumptions.homeLoanShare);
    }

    const homeLoanAmount = totalCost * (homeLoanShare / 100);
    const personalLoan1Amount = totalCost * (personalLoan1Share / 100);
    const personalLoan2Amount = totalCost * (personalLoan2Share / 100);
    const downPaymentAmount = totalCost * (downPaymentShare / 100);
    const totalCashInvested = downPaymentAmount + personalLoan1Amount + personalLoan2Amount;

    const homeLoanEMI = calculateEMI(homeLoanAmount, assumptions.homeLoanRate, assumptions.homeLoanTerm);
    const personalLoan1EMI = calculateEMI(personalLoan1Amount, assumptions.personalLoan1Rate, assumptions.personalLoan1Term);
    const personalLoan2EMI = calculateEMI(personalLoan2Amount, assumptions.personalLoan2Rate, assumptions.personalLoan2Term);

    const hlMode = assumptions.homeLoanStartMode || 'default';
    const hlInputValue = getSafeValue(assumptions.homeLoanStartMonth);

    // --- 3. Determine Funding Window ---
    const explicitLast = getSafeValue(assumptions.lastBankDisbursementMonth);
    const constructionEnd = getSafeValue(assumptions.clpDurationYears) * 12;
    const lastDemandMonth = explicitLast > 0 ? explicitLast : (constructionEnd > 0 ? constructionEnd : (possessionMonths || 24));

    let realHomeLoanStartMonth;
    if (hlMode === 'manual') {
        realHomeLoanStartMonth = hlInputValue;
    } else {
        realHomeLoanStartMonth = lastDemandMonth + hlInputValue + 1;
    }
    const idcCutoffMonth = realHomeLoanStartMonth - 1;

    let idcSchedule: any[] = [];

    // =====================================================================
    // 👇 FIX: GENERATE DISBURSEMENT SCHEDULE (START -> END in INTERVALS) 👇
    // =====================================================================
    if (homeLoanAmount > 0) {
        let startMonth = getSafeValue(assumptions.bankDisbursementStartMonth) || 1;

        // For Manual mode with "0" start input, assume immediate disbursement at Month 0
        if (hlMode === 'manual' && assumptions.bankDisbursementStartMonth === 0) {
            startMonth = 0;
        }

        const interval = getSafeValue(assumptions.bankDisbursementInterval) || 3;
        const fundingEndMonth = lastDemandMonth;

        // Calculate Slab Amount
        // e.g. Start: 2, End: 10, Interval: 2 => Months: 2, 4, 6, 8, 10 => 5 Slabs
        const calculatedSlabs = Math.floor((fundingEndMonth - startMonth) / interval) + 1;
        const numberOfSlabs = Math.max(1, calculatedSlabs);
        const slabAmount = homeLoanAmount / numberOfSlabs;

        let remainingLoan = homeLoanAmount;

        // ✅ THE LOOP YOU ASKED FOR: Starts at startMonth, Jumps by Interval
        for (let m = startMonth; m <= fundingEndMonth; m += interval) {
            if (remainingLoan <= 1) break; // Stop if nothing left

            let thisSlab = slabAmount;
            // Fix rounding issues on last slab
            if ((m + interval > fundingEndMonth) || (remainingLoan - thisSlab < 10)) {
                thisSlab = remainingLoan;
            }

            idcSchedule.push({
                slabNo: idcSchedule.length + 1,
                releaseMonth: m,
                amount: thisSlab,
                interestCost: 0 // Will calc in next loop
            });

            remainingLoan -= thisSlab;
        }

        // Failsafe: If schedule is empty (e.g. bad inputs), force one slab at start
        if (idcSchedule.length === 0) {
            idcSchedule.push({ slabNo: 1, releaseMonth: startMonth, amount: homeLoanAmount, interestCost: 0 });
        }
    }
    // =====================================================================


    // --- 4. CALCULATE LEDGER & IDC INTEREST (Month 0 -> End) ---
    const monthlyLedger: LedgerRow[] = [];
    let totalIDC = 0;
    let monthlyIDCEMI = 0;
    let minIDCEMI = 0;
    let maxIDCEMI = 0;
    let truePrePossessionTotal = 0;
    let totalLifetimeInterest = 0;

    if (homeLoanAmount > 0) {
        const tableEndMonth = possessionMonths;
        const hlRate = getSafeValue(assumptions.homeLoanRate);
        const effectivePL1Start = getSafeValue(assumptions.personalLoan1StartMonth);

        let cumDisb_Ledger = 0;
        let outBal_Ledger = 0;
        let activeSlabs_Ledger = 0;

        let runningTotalIDC = 0;
        let runningTotalOutflow = 0;
        let isFirstIDCPayment = false;

        for (let m = 0; m <= tableEndMonth; m++) {
            let currentDisbursement = 0;
            let interestForThisMonth = 0;
            let principalRepaidThisMonth = 0;

            // A. Check Schedule for Disbursement
            const scheduleItem = idcSchedule.find(s => s.releaseMonth === m);
            if (scheduleItem) {
                currentDisbursement = scheduleItem.amount;
                cumDisb_Ledger += currentDisbursement;

                // Add to balance
                if (hlMode === 'manual') outBal_Ledger += currentDisbursement;
                else if (m < realHomeLoanStartMonth) outBal_Ledger = cumDisb_Ledger;
                else outBal_Ledger += currentDisbursement;

                activeSlabs_Ledger++;
            }

            // B. Calculate Interest (On Outstanding Balance)
            if (outBal_Ledger > 0) {
                // If Manual Mode, interest might accrue or be paid. 
                // We calculate it regardless for display.
                interestForThisMonth = (outBal_Ledger * (hlRate / 100)) / 12;
            }

            // C. Calculate Payment (EMI or Pre-EMI)
            let hlPayment = 0;
            let isFullEMI = false;

            if (m >= realHomeLoanStartMonth) {
                // Full EMI Phase
                hlPayment = homeLoanEMI;
                isFullEMI = true;
                if (outBal_Ledger > 0) {
                    principalRepaidThisMonth = Math.max(0, hlPayment - interestForThisMonth);
                    outBal_Ledger -= principalRepaidThisMonth;
                }
            } else {
                // Pre-EMI Phase
                if (hlMode === 'manual') {
                    // Manual: Show 0 payment (Visual only).
                    // In real life, interest compounds, but we keep simple for visual ledger.
                    hlPayment = 0;
                } else {
                    // Default: Pay Interest (IDC)
                    hlPayment = interestForThisMonth;
                    runningTotalIDC += interestForThisMonth;
                }
            }

            // D. Stats for IDC Summary
            if (!isFullEMI && hlPayment > 0) {
                if (!isFirstIDCPayment) { minIDCEMI = hlPayment; isFirstIDCPayment = true; }
                maxIDCEMI = hlPayment;
            }

            const currentPL1 = (m >= effectivePL1Start) ? personalLoan1EMI : 0;
            const totalRowOutflow = hlPayment + currentPL1;

            if (m <= possessionMonths) runningTotalOutflow += totalRowOutflow;

            monthlyLedger.push({
                month: m,
                disbursement: currentDisbursement,
                activeSlabs: m > lastDemandMonth ? 'Max' : activeSlabs_Ledger,
                cumulativeDisbursement: cumDisb_Ledger,
                outstandingBalance: Math.max(0, outBal_Ledger),
                hlComponent: hlPayment,
                interestPart: interestForThisMonth,
                principalPart: principalRepaidThisMonth,
                isFullEMI,
                pl1: currentPL1,
                totalOutflow: totalRowOutflow
            });
        }

        // Finalize IDC Stats
        totalIDC = runningTotalIDC;
        totalLifetimeInterest = totalIDC; // + post possession interest if tracked separately
        truePrePossessionTotal = runningTotalOutflow;

        // Avg IDC
        const activeIDCMonths = Math.max(1, idcCutoffMonth - (idcSchedule[0]?.releaseMonth || 0) + 1);
        monthlyIDCEMI = totalIDC / activeIDCMonths;
    }

    // --- 5. Loan Lifecycle Variables (Using Ledger Totals where accurate) ---
    const homeLoanPaymentsMade = Math.max(0, totalHoldingMonths - (realHomeLoanStartMonth - 1));
    const pl1PaymentsMade = Math.max(0, totalHoldingMonths - assumptions.personalLoan1StartMonth);
    const pl2PaymentsMade = Math.max(0, totalHoldingMonths - (possessionMonths + assumptions.personalLoan2StartMonth));

    // Get final balance from ledger if available
    const finalLedgerRow = monthlyLedger[totalHoldingMonths] || monthlyLedger[monthlyLedger.length - 1];
    const homeLoanOutstanding = finalLedgerRow ? finalLedgerRow.outstandingBalance : 0;

    // Standard calc for PLs since they are simpler
    const personalLoan1Outstanding = personalLoan1Amount > 0 ? calculateOutstandingAfterPayments(personalLoan1Amount, assumptions.personalLoan1Rate, assumptions.personalLoan1Term, pl1PaymentsMade) : 0;
    const personalLoan2Outstanding = personalLoan2Amount > 0 ? calculateOutstandingAfterPayments(personalLoan2Amount, assumptions.personalLoan2Rate, assumptions.personalLoan2Term, pl2PaymentsMade) : 0;

    const totalLoanOutstanding = homeLoanOutstanding + personalLoan1Outstanding + personalLoan2Outstanding;

    // Summing Payments from Ledger is more accurate for Manual cases
    const totalHLPaid_Ledger = monthlyLedger.reduce((sum, row) => sum + row.hlComponent, 0);
    const totalEMIPaid = totalHLPaid_Ledger + (personalLoan1EMI * pl1PaymentsMade) + (personalLoan2EMI * pl2PaymentsMade);

    const saleValue = propertySize * targetExitPrice;
    const leftoverCash = saleValue - totalLoanOutstanding;
    const trueNetProfit = leftoverCash - totalEMIPaid - downPaymentAmount;
    const totalActualInvestment = downPaymentAmount + totalEMIPaid;
    const roi = totalActualInvestment > 0 ? (trueNetProfit / totalActualInvestment) * 100 : 0;

    const homeLoanInt = homeLoanAmount > 0 ? calculateTotalInterestPaid(homeLoanAmount, assumptions.homeLoanRate, assumptions.homeLoanTerm, homeLoanPaymentsMade) : 0;
    const pl1Int = personalLoan1Amount > 0 ? calculateTotalInterestPaid(personalLoan1Amount, assumptions.personalLoan1Rate, assumptions.personalLoan1Term, pl1PaymentsMade) : 0;
    const pl2Int = personalLoan2Amount > 0 ? calculateTotalInterestPaid(personalLoan2Amount, assumptions.personalLoan2Rate, assumptions.personalLoan2Term, pl2PaymentsMade) : 0;
    const idcInt = totalIDC;

    const prePossessionMonths = Math.min(totalHoldingMonths, possessionMonths);
    const postPossessionMonths = Math.max(0, totalHoldingMonths - possessionMonths);
    const prePossessionEMI = personalLoan1EMI + monthlyIDCEMI;
    const postPossessionEMI = homeLoanEMI + personalLoan1EMI + personalLoan2EMI;
    // REMOVE THIS OLD LINE:
    // const phase2TotalCalc = (homeLoanEMI * postPossessionMonths) + (personalLoan1EMI * Math.max(0, postPossessionMonths - (getSafeValue(assumptions.personalLoan1StartMonth) - (possessionMonths + 1)))) + ...

    // ADD THIS NEW LOGIC BLOCK:
    const pl1TotalPayments = Math.max(0, totalHoldingMonths - getSafeValue(assumptions.personalLoan1StartMonth));
    const pl1PrePossessionPayments = Math.max(0, Math.min(pl1TotalPayments, possessionMonths - getSafeValue(assumptions.personalLoan1StartMonth)));
    const pl1PostPossessionPayments = Math.max(0, pl1TotalPayments - pl1PrePossessionPayments);

    const pl2TotalPayments = Math.max(0, totalHoldingMonths - (possessionMonths + getSafeValue(assumptions.personalLoan2StartMonth)));
    const pl2PrePossessionPayments = Math.max(0, Math.min(pl2TotalPayments, possessionMonths - (possessionMonths + getSafeValue(assumptions.personalLoan2StartMonth))));
    const pl2PostPossessionPayments = Math.max(0, pl2TotalPayments - pl2PrePossessionPayments);

    const phase2TotalCalc =
        (homeLoanEMI * postPossessionMonths) +
        (personalLoan1EMI * pl1PostPossessionPayments) +
        (personalLoan2EMI * pl2PostPossessionPayments);
    // --- 6. Return Data ---
    // Update IDC Report with interest costs
    // REPLACE THE "If (idcSchedule.length > 0)" BLOCK (Lines 304-315) WITH THIS:

    // --- 6. Return Data ---
    if (idcSchedule.length > 0) {
        let calculatedGrandTotal = 0;
        let runningMonthlyInt = 0; // To track cumulative monthly interest
        const hlRate = getSafeValue(assumptions.homeLoanRate);

        // We use idcCutoffMonth (The month BEFORE full EMI starts) to calculate duration
        // If disbursements go up to Month 18, and EMI starts Month 19, idcCutoffMonth is 18.

        idcSchedule = idcSchedule.map(slab => {
            // 1. Calculate Monthly Interest for this specific slab (Amount * Rate / 12)
            const monthlyInterest = (slab.amount * (hlRate / 100)) / 12;

            // 2. Calculate Duration
            // How many months does this slab accrue interest before the Full EMI phase begins?
            // Formula: (Cutoff - Release) + 1. 
            // Example: Release Month 3, Cutoff 18. Duration = 16 months (3,4...18).
            const duration = Math.max(0, idcCutoffMonth - slab.releaseMonth + 1);

            // 3. Total Cost for this slab over its pre-EMI life
            const totalCostForSlab = monthlyInterest * duration;

            // 4. Update Running Totals
            calculatedGrandTotal += totalCostForSlab;
            runningMonthlyInt += monthlyInterest;

            return {
                ...slab,
                monthlyInterest: monthlyInterest,           // Fixes "Monthly Interest" column
                duration: duration,                         // Fixes "Interest Duration" column
                totalCostForSlab: totalCostForSlab,         // Fixes "Total IDC" column
                cumulativeMonthlyInterest: runningMonthlyInt, // Needed if you show "Current Total Interest"
                interestCost: totalCostForSlab
            };
        });
    }

    // Note: Reusing your existing idcReport object structure
    const idcReport: IdcReport = {
        grandTotalInterest: totalIDC,
        minMonthlyInterest: minIDCEMI,
        maxMonthlyInterest: maxIDCEMI,
        schedule: idcSchedule, // Map simplified schedule to report
        cutoffMonth: idcCutoffMonth
    };

    return {
        propertySize,
        totalCost,
        totalCashInvested,
        totalLoanOutstanding,
        homeLoanEMI,
        personalLoan1EMI,
        personalLoan2EMI,
        gstCost,
        stampDutyCost,
        homeLoanAmount,
        personalLoan1Amount,
        personalLoan2Amount,
        downPaymentAmount,
        homeLoanShare,
        personalLoan1Share,
        personalLoan2Share,
        downPaymentShare,
        totalInterestPaid: homeLoanInt + pl1Int + pl2Int + idcInt,
        homeLoanInterestPaid: homeLoanInt,
        personalLoan1InterestPaid: pl1Int,
        personalLoan2InterestPaid: pl2Int,
        homeLoanEMIPaid: totalHLPaid_Ledger,
        personalLoan1EMIPaid: personalLoan1EMI * pl1PaymentsMade,
        personalLoan2EMIPaid: personalLoan2EMI * pl2PaymentsMade,
        totalIDC: idcInt,
        monthlyIDCEMI,
        idcSchedule,
        monthlyLedger,
        idcReport,
        minIDCEMI,
        maxIDCEMI,
        totalEMIPaid,
        saleValue,
        leftoverCash,
        netGainLoss: trueNetProfit,
        roi,
        exitPrice: targetExitPrice,
        years: displayYears,
        prePossessionMonths,
        postPossessionMonths,
        prePossessionEMI,
        postPossessionEMI,
        prePossessionTotal: truePrePossessionTotal,
        postPossessionTotal: phase2TotalCalc,
        possessionMonths,
        totalHoldingMonths,
        homeLoanStartMonth: realHomeLoanStartMonth,
        hasHomeLoan: homeLoanAmount > 0,
        hasPersonalLoan1: personalLoan1Amount > 0,
        hasPersonalLoan2: personalLoan2Amount > 0,
        hasDownPayment: downPaymentAmount > 0,
        hasIDC: totalIDC > 0,
        pl1StartMonth: assumptions.personalLoan1StartMonth,
        pl2StartMonth: possessionMonths + assumptions.personalLoan2StartMonth
    };
};

// ... (calculateFinancials export remains unchanged) ...
export const calculateFinancials = (data: ScenarioInput) => {
    // ... same as before
    const detailedBreakdown = calculateMetricsForPrice(data, data.selectedExitPrice);
    const allPrices = Array.from(new Set([
        data.selectedExitPrice,
        ...(data.scenarioExitPrices || [])
    ])).sort((a, b) => a - b);

    const multipleScenarios = allPrices.map(price => {
        const result = calculateMetricsForPrice(data, price);
        return {
            exitPrice: price,
            saleValue: result.saleValue,
            netProfit: result.netGainLoss,
            roi: result.roi,
            leftoverCash: result.leftoverCash,
            isSelected: price === data.selectedExitPrice
        };
    });

    const profits = multipleScenarios.map(s => ({
        exitPrice: s.exitPrice,
        netProfit: s.netProfit,
        roi: s.roi
    }));

    // Return structure (same as before)
    return {
        detailedBreakdown,
        multipleScenarios,
        profits,
        stageCalculations: {
            stage1: {
                title: "Stage 1: Basic Property Cost",
                items: [
                    { label: "Property Size", value: `${detailedBreakdown.propertySize} sq.ft` },
                    { label: "Purchase Price", value: `${formatCurrency(data.purchasePrice)}/sq.ft` },
                    { label: "Other Charges", value: formatCurrency(getSafeValue(data.otherCharges)) },
                    { label: "Stamp Duty", value: formatCurrency(detailedBreakdown.stampDutyCost) },
                    { label: "GST charges", value: formatCurrency(detailedBreakdown.gstCost) },
                    { label: "Total Property Cost", value: formatCurrency(detailedBreakdown.totalCost) }
                ]
            },
            stage2: {
                title: "Stage 2: Funding",
                items: [
                    { label: "Down Payment", value: formatCurrency(detailedBreakdown.downPaymentAmount) },
                    { label: "Home Loan", value: formatCurrency(detailedBreakdown.homeLoanAmount) },
                    { label: "PL1", value: formatCurrency(detailedBreakdown.personalLoan1Amount) },
                    { label: "PL2", value: formatCurrency(detailedBreakdown.personalLoan2Amount) }
                ]
            },
            stage3: {
                title: "Stage 3: Monthly",
                items: [
                    { label: "Home Loan EMI", value: formatCurrency(detailedBreakdown.homeLoanEMI) },
                    { label: "PL1 EMI", value: formatCurrency(detailedBreakdown.personalLoan1EMI) },
                    { label: "PL2 EMI", value: formatCurrency(detailedBreakdown.personalLoan2EMI) },
                    { label: "Total Monthly", value: formatCurrency(detailedBreakdown.postPossessionEMI) }
                ]
            },
            stage4: {
                title: "Stage 4: Exit",
                items: [
                    { label: "Duration", value: `${detailedBreakdown.years} years` },
                    { label: "Exit Price", value: `${formatCurrency(detailedBreakdown.exitPrice)}/sq.ft` },
                    { label: "Sale Value", value: formatCurrency(detailedBreakdown.saleValue) }
                ]
            }
        }
    };
};