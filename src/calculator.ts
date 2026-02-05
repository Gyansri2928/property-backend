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

// ✅ NEW: IDC Report Interface
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

const formatCurrency = (value: number): string => {
    if (value === undefined || value === null || isNaN(value)) return "₹0";
    return "₹" + Math.round(value).toLocaleString('en-IN');
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

    // ✅ SAFETY FIX: Handle 0% interest to prevent Division by Zero or NaN
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
    
    // ... Standard setup ...
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
    const totalCost = baseCost; // Simplified for now

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
    
    let lastDemandMonth = possessionMonths;
    if (paymentPlan === 'clp') {
        const explicitLast = getSafeValue(assumptions.lastBankDisbursementMonth);
        const constructionEnd = getSafeValue(assumptions.clpDurationYears) * 12;
        lastDemandMonth = explicitLast > 0 ? explicitLast : (constructionEnd > 0 ? constructionEnd : possessionMonths);
    }

    let realHomeLoanStartMonth;
    if (hlMode === 'manual') {
        realHomeLoanStartMonth = hlInputValue;
    } else {
        realHomeLoanStartMonth = lastDemandMonth + hlInputValue + 1;
    }
    const idcCutoffMonth = realHomeLoanStartMonth - 1;

    let totalIDC = 0;
    let monthlyIDCEMI = 0;
    let minIDCEMI = 0;
    let maxIDCEMI = 0;
    let idcSchedule: any[] = [];
    let truePrePossessionTotal = 0;
    let totalLifetimeInterest = 0;

    // --- IDC LOGIC FOR MAIN REPORT ---
    if (paymentPlan === 'clp' && homeLoanAmount > 0) {
        const interval = getSafeValue(assumptions.bankDisbursementInterval) || 3;
        let startMonth = getSafeValue(assumptions.bankDisbursementStartMonth) || 1;
        const fundingEndMonth = lastDemandMonth;
        const hlRate = getSafeValue(assumptions.homeLoanRate);

        const calculatedSlabs = Math.floor((fundingEndMonth - startMonth) / interval) + 1;
        const numberOfSlabs = Math.max(1, calculatedSlabs);
        const slabAmount = homeLoanAmount / numberOfSlabs;

        let cumulativeDisbursement = 0;
        let runningTotalIDC = 0;
        let runningTotalOutflow = 0;
        let isFirstIDCPayment = false;

        const loopEnd = Math.min(totalHoldingMonths || possessionMonths, possessionMonths);

        for (let m = 0; m <= loopEnd; m++) {
            const isPhase1_IDC = m <= fundingEndMonth && m <= idcCutoffMonth;
            let monthlyHLComponent = 0;

            if (isPhase1_IDC) {
                const isScheduleMonth = (m >= startMonth) && ((m - startMonth) % interval === 0) && (m !== startMonth);
                const isStartMonthTrigger = (startMonth !== 0 && m === startMonth);

                if ((isScheduleMonth || isStartMonthTrigger) && cumulativeDisbursement < (homeLoanAmount - 10)) {
                    cumulativeDisbursement += slabAmount;
                    if (cumulativeDisbursement > homeLoanAmount) cumulativeDisbursement = homeLoanAmount;
                    
                    idcSchedule.push({
                        slabNo: idcSchedule.length + 1,
                        releaseMonth: m,
                        amount: slabAmount,
                        interestCost: 0 
                    });
                }
                monthlyHLComponent = (cumulativeDisbursement * (hlRate / 100)) / 12;
                runningTotalIDC += monthlyHLComponent;

                if (monthlyHLComponent > 0) {
                    if (!isFirstIDCPayment) { minIDCEMI = monthlyHLComponent; isFirstIDCPayment = true; }
                    maxIDCEMI = monthlyHLComponent;
                }
            } else {
                if (m >= realHomeLoanStartMonth) {
                    monthlyHLComponent = homeLoanEMI;
                } else {
                    monthlyHLComponent = (cumulativeDisbursement * (hlRate / 100)) / 12;
                    runningTotalIDC += monthlyHLComponent;
                }
            }
            
            const pl1StartMonth = getSafeValue(assumptions.personalLoan1StartMonth);
            const monthlyPL1 = (personalLoan1Amount > 0 && m >= pl1StartMonth) ? personalLoan1EMI : 0;
            runningTotalOutflow += (monthlyHLComponent + monthlyPL1);
        }

        totalIDC = runningTotalIDC;
        truePrePossessionTotal = runningTotalOutflow;
        totalLifetimeInterest = totalIDC;
        const activeIDCMonths = Math.min(idcCutoffMonth, fundingEndMonth) - startMonth + 1;
        monthlyIDCEMI = activeIDCMonths > 0 ? (totalIDC / activeIDCMonths) : 0;

        idcSchedule = idcSchedule.map(slab => {
             if (slab.releaseMonth > idcCutoffMonth) return { ...slab, interestCost: 0 };
             const monthsOfInterest = Math.max(0, idcCutoffMonth - slab.releaseMonth + 1);
             return { ...slab, interestCost: (slab.amount * (hlRate / 100) / 12) * monthsOfInterest };
        });
    }

    // --- OTHER VARIABLES ---
    const homeLoanPaymentsMade = Math.max(0, totalHoldingMonths - (realHomeLoanStartMonth - 1));
    const pl1PaymentsMade = Math.max(0, totalHoldingMonths - assumptions.personalLoan1StartMonth);
    const pl2PaymentsMade = Math.max(0, totalHoldingMonths - (possessionMonths + assumptions.personalLoan2StartMonth));

    const homeLoanOutstanding = homeLoanAmount > 0 ? calculateOutstandingAfterPayments(homeLoanAmount, assumptions.homeLoanRate, assumptions.homeLoanTerm, homeLoanPaymentsMade) : 0;
    const personalLoan1Outstanding = personalLoan1Amount > 0 ? calculateOutstandingAfterPayments(personalLoan1Amount, assumptions.personalLoan1Rate, assumptions.personalLoan1Term, pl1PaymentsMade) : 0;
    const personalLoan2Outstanding = personalLoan2Amount > 0 ? calculateOutstandingAfterPayments(personalLoan2Amount, assumptions.personalLoan2Rate, assumptions.personalLoan2Term, pl2PaymentsMade) : 0;

    const totalLoanOutstanding = homeLoanOutstanding + personalLoan1Outstanding + personalLoan2Outstanding;
    const totalEMIPaid = (homeLoanEMI * homeLoanPaymentsMade) + (personalLoan1EMI * pl1PaymentsMade) + (personalLoan2EMI * pl2PaymentsMade) + totalIDC;
    
    const saleValue = propertySize * targetExitPrice;
    const leftoverCash = saleValue - totalLoanOutstanding;
    const trueNetProfit = leftoverCash - totalEMIPaid - downPaymentAmount;
    const totalActualInvestment = downPaymentAmount + totalEMIPaid;
    const roi = totalActualInvestment > 0 ? (trueNetProfit / totalActualInvestment) * 100 : 0;
    
    const homeLoanInt = homeLoanAmount > 0 ? calculateTotalInterestPaid(homeLoanAmount, assumptions.homeLoanRate, assumptions.homeLoanTerm, homeLoanPaymentsMade) : 0;
    const pl1Int = personalLoan1Amount > 0 ? calculateTotalInterestPaid(personalLoan1Amount, assumptions.personalLoan1Rate, assumptions.personalLoan1Term, pl1PaymentsMade) : 0;
    const pl2Int = personalLoan2Amount > 0 ? calculateTotalInterestPaid(personalLoan2Amount, assumptions.personalLoan2Rate, assumptions.personalLoan2Term, pl2PaymentsMade) : 0;
    const idcInt = paymentPlan === 'clp' ? totalLifetimeInterest : totalIDC;

    const prePossessionMonths = Math.min(totalHoldingMonths, possessionMonths);
    const postPossessionMonths = Math.max(0, totalHoldingMonths - possessionMonths);
    const prePossessionEMI = personalLoan1EMI + monthlyIDCEMI;
    const postPossessionEMI = homeLoanEMI + personalLoan1EMI + personalLoan2EMI;

    const pl1DelayInPhase2 = Math.max(0, getSafeValue(assumptions.personalLoan1StartMonth) - (possessionMonths + 1));
    const pl1PostMonths = Math.max(0, postPossessionMonths - pl1DelayInPhase2);
    const pl2PostMonths = Math.max(0, postPossessionMonths - getSafeValue(assumptions.personalLoan2StartMonth));
    
    const phase2TotalCalc = (homeLoanEMI * postPossessionMonths) + (personalLoan1EMI * pl1PostMonths) + (personalLoan2EMI * pl2PostMonths);

    // --- GENERATE MONTHLY LEDGER ---
    const monthlyLedger: LedgerRow[] = [];
    if (homeLoanAmount > 0) {
        const tableEndMonth = possessionMonths;
        const fundingEndMonth = lastDemandMonth;
        
        let actualHLStartMonth_Ledger;
        if (hlMode === 'manual') {
            actualHLStartMonth_Ledger = hlInputValue === 0 ? 1 : hlInputValue;
        } else {
            actualHLStartMonth_Ledger = fundingEndMonth + 1;
        }

        const effectivePL1Start = getSafeValue(assumptions.personalLoan1StartMonth);
        const slabAmount = idcSchedule.length > 0 ? homeLoanAmount / idcSchedule.length : homeLoanAmount;

        let cumDisb_Ledger = 0;
        let outBal_Ledger = 0;
        let activeSlabs_Ledger = 0;

        for (let m = 0; m <= tableEndMonth; m++) {
            let currentDisbursement = 0;
            let interestForThisMonth = 0;
            let principalRepaidThisMonth = 0;

            if (homeLoanAmount > 0 && m <= fundingEndMonth) {
                const isScheduleMonth = idcSchedule.some(s => s.releaseMonth === m);
                if (isScheduleMonth && cumDisb_Ledger < (homeLoanAmount - 10)) {
                    currentDisbursement = slabAmount;
                    cumDisb_Ledger += slabAmount;
                    if (hlMode === 'manual') outBal_Ledger += slabAmount;
                    else outBal_Ledger = cumDisb_Ledger;
                    activeSlabs_Ledger++;
                }
            }

            if (outBal_Ledger > 0) {
                // ✅ NEW LOGIC: Only charge IDC interest up to the funding end month
                if (m <= fundingEndMonth) {
                    interestForThisMonth = (outBal_Ledger * (assumptions.homeLoanRate / 100)) / 12;
                } else {
                    interestForThisMonth = 0;
                }
            }

            let hlPayment = 0;
            let isFullEMI = false;

            if (homeLoanAmount > 0) {
                if (m >= actualHLStartMonth_Ledger) {
                    hlPayment = homeLoanEMI;
                    isFullEMI = true;
                    if (outBal_Ledger > 0) {
                        principalRepaidThisMonth = Math.max(0, hlPayment - interestForThisMonth);
                        outBal_Ledger -= principalRepaidThisMonth;
                    }
                } else {
                    if (hlMode === 'manual') hlPayment = 0;
                    else {
                        hlPayment = interestForThisMonth;
                        principalRepaidThisMonth = 0;
                    }
                }
            }

            const currentPL1 = (m >= effectivePL1Start) ? personalLoan1EMI : 0;

            monthlyLedger.push({
                month: m,
                disbursement: currentDisbursement,
                activeSlabs: m > fundingEndMonth ? 'Max' : activeSlabs_Ledger,
                cumulativeDisbursement: cumDisb_Ledger,
                outstandingBalance: Math.max(0, outBal_Ledger),
                hlComponent: hlPayment,
                interestPart: interestForThisMonth,
                principalPart: principalRepaidThisMonth,
                isFullEMI,
                pl1: currentPL1,
                totalOutflow: hlPayment + currentPL1
            });
        }
    }

    // ✅ NEW: GENERATE IDC REPORT
    const idcReport: IdcReport = {
        grandTotalInterest: 0,
        minMonthlyInterest: 0,
        maxMonthlyInterest: 0,
        schedule: [],
        cutoffMonth: 0
    };

    if (idcSchedule.length > 0) {
        // 1. Determine Interest End Month
        let interestEndMonth = possessionMonths;
        const explicitLast = getSafeValue(assumptions.lastBankDisbursementMonth);
        if (explicitLast > 0) interestEndMonth = explicitLast;
        if (hlMode === 'manual' && hlInputValue > 0) interestEndMonth = hlInputValue - 1;

        // 2. Base vars
        const disbursementPerSlab = homeLoanAmount / idcSchedule.length;
        const baseSlabInterest = disbursementPerSlab * (assumptions.homeLoanRate / 100) / 12;
        
        let calculatedGrandTotal = 0;

        // 3. Build the schedule rows
        idcReport.schedule = idcSchedule.map((row, idx) => {
            let duration = 0;
            if (row.releaseMonth <= interestEndMonth) {
                duration = Math.max(0, interestEndMonth - row.releaseMonth + 1);
            }

            const cumulativeMonthlyInterest = baseSlabInterest * (idx + 1);
            const totalCostForSlab = baseSlabInterest * duration;
            calculatedGrandTotal += totalCostForSlab;

            return {
                slabNo: row.slabNo,
                releaseMonth: row.releaseMonth,
                amount: disbursementPerSlab,
                monthlyInterest: baseSlabInterest, // Per slab interest
                cumulativeMonthlyInterest: cumulativeMonthlyInterest, // What user pays that month (sum of active slabs)
                duration: duration,
                totalCostForSlab: totalCostForSlab
            };
        });

        idcReport.grandTotalInterest = calculatedGrandTotal;
        idcReport.minMonthlyInterest = baseSlabInterest;
        idcReport.maxMonthlyInterest = baseSlabInterest * idcSchedule.length;
        idcReport.cutoffMonth = interestEndMonth;
    }

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
        homeLoanEMIPaid: homeLoanEMI * homeLoanPaymentsMade,
        personalLoan1EMIPaid: personalLoan1EMI * pl1PaymentsMade,
        personalLoan2EMIPaid: personalLoan2EMI * pl2PaymentsMade,
        totalIDC: idcInt,
        monthlyIDCEMI,
        idcSchedule,
        monthlyLedger, 
        idcReport, // ✅ Return the new report
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
        prePossessionTotal: truePrePossessionTotal > 0 ? truePrePossessionTotal : (prePossessionEMI * (prePossessionMonths + 1)),
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

// ===================== 4. EXPORTED FUNCTION =====================

export const calculateFinancials = (data: ScenarioInput) => {
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
