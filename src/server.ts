// src/server.ts
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { calculateFinancials, ScenarioInput } from './calculator';

const app = express();
// const PORT = Number(process.env.PORT) || 5000; // Not needed for Vercel deployment

// Middleware
app.use(cors());
app.use(bodyParser.json());

// === API ROUTES ===

// 1. Health Check
app.get('/', (req, res) => {
    res.send('Property Analyzer API is Running 🚀');
});

// 2. The Main Calculation Endpoint
app.post('/api/calculate', (req, res) => {
    try {
        const inputData: ScenarioInput = req.body;

        if (!inputData.purchasePrice || !inputData.selectedProperty) {
            // @ts-ignore
            return res.status(400).json({ error: 'Missing required property data' });
        }

        const result = calculateFinancials(inputData);

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error("Calculation Error:", error);
        // @ts-ignore
        res.status(500).json({ error: 'Internal Server Error', details: error });
    }
});

// ✅ CHANGE 1: Comment out app.listen (Vercel manages the port automatically)
// app.listen(PORT, '0.0.0.0', () => {
//     console.log(`Server running on http://0.0.0.0:${PORT}`);
// });

// ✅ CHANGE 2: Export the app for Vercel
export default app;