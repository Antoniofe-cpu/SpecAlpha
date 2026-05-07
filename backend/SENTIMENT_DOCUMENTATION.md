# 📊 Sentiment Calculator - Documentazione Completa

## Come Funziona il Calcolo del Sentiment Attuale

### 🎯 Metodo: COT-Based Sentiment (Institutional)

Il sentiment viene calcolato dai **dati COT (Commitment of Traders)** pubblicati settimanalmente dalla CFTC.

### 📐 Formula di Calcolo

```
Sentiment Score = (Net Position × 40%) + (WoW Delta × 40%) + (Long/Short Ratio × 20%) × 100
Range: -100 (Extremely Bearish) to +100 (Extremely Bullish)
```

### 🔢 Componenti del Calcolo

#### 1. **Net Position (40% weight)**
- Formula: `Long Contracts - Short Contracts`
- Normalizzazione: `-150,000 to +150,000` → `-1 to +1`
- **Esempio**: 
  * Net = +100,000 → Normalized = +0.67
  * Contributo al sentiment: +0.67 × 0.4 × 100 = **+26.8 punti**

#### 2. **Week-over-Week Delta (40% weight)**
- Formula: `Net Position questa settimana - Net Position settimana scorsa`
- Normalizzazione: `-30,000 to +30,000` → `-1 to +1`
- **Esempio**:
  * Delta = +10,000 → Normalized = +0.33
  * Contributo: +0.33 × 0.4 × 100 = **+13.2 punti**
- **Significato**: Cattura il *momentum* del sentiment (in aumento/diminuzione)

#### 3. **Long/Short Ratio (20% weight)**
- Formula: `Long Contracts / Short Contracts`
- Normalizzazione:
  * Ratio > 1: `(ratio - 1) / 2` → 0 to +1 (bullish)
  * Ratio < 1: `(ratio - 1) × 2` → -1 to 0 (bearish)
- **Esempio**:
  * Ratio = 2.0 (2x più long che short) → Normalized = +0.5
  * Contributo: +0.5 × 0.2 × 100 = **+10 punti**

### 📊 Esempio Completo: S&P 500

**Dati COT**:
- Long: 150,000 contratti
- Short: 100,000 contratti
- Net Position: +50,000
- Net Position settimana scorsa: +40,000
- WoW Delta: +10,000

**Calcolo Step-by-Step**:

1. **Net Position Component**:
   ```
   Net normalized = 50,000 / 150,000 = 0.33
   Contribution = 0.33 × 0.4 × 100 = 13.2 punti
   ```

2. **Delta Component**:
   ```
   Delta normalized = 10,000 / 30,000 = 0.33
   Contribution = 0.33 × 0.4 × 100 = 13.2 punti
   ```

3. **Ratio Component**:
   ```
   Ratio = 150,000 / 100,000 = 1.5
   Ratio normalized = (1.5 - 1) / 2 = 0.25
   Contribution = 0.25 × 0.2 × 100 = 5.0 punti
   ```

**Sentiment Finale**: `13.2 + 13.2 + 5.0 = +31.4` → **"Slightly Bullish"**

---

## 🎭 Interpretazione del Sentiment Score

| Score Range | Classificazione | Significato | Azione Suggerita |
|-------------|----------------|-------------|------------------|
| +70 to +100 | **Extremely Bullish** | Euforia istituzionale, rischio overbought | Considera taking profit |
| +40 to +69 | **Bullish** | Accumulo netto significativo | Hold long, aggiungi su pullback |
| +10 to +39 | **Slightly Bullish** | Leggero bias positivo | Cautiously bullish |
| -9 to +9 | **Neutral** | Equilibrio long/short | Wait & see, analizza altri fattori |
| -39 to -10 | **Slightly Bearish** | Leggero bias negativo | Cautiously bearish |
| -69 to -40 | **Bearish** | Distribuzione netta significativa | Hold short, riduci long |
| -100 to -70 | **Extremely Bearish** | Panico istituzionale, rischio oversold | Considera contrarian buy |

---

## 🆚 COT Sentiment vs Retail Sentiment

### COT (Institutional) - **Attuale**
✅ **Vantaggi**:
- Dati ufficiali CFTC (100% affidabili)
- Cattura posizionamento **hedge funds, asset managers, banche**
- Storico completo (30+ anni)
- **Contrarian indicator**: Quando istituzionali sono estremi, spesso il mercato inverte

❌ **Svantaggi**:
- Pubblicato **settimanalmente** (ritardo 3 giorni)
- Non include sentiment retail
- Solo per assets con futures (no crypto)

### Fear & Greed Index (Retail) - **Nuovo**
✅ **Vantaggi**:
- Aggiornato **giornalmente** (real-time per crypto)
- Cattura sentiment **retail traders, social media, volume**
- 100% gratuito (Alternative.me)
- Ottimo per crypto (BTC, ETH)

❌ **Svantaggi**:
- Solo crypto (no forex, indices, commodities tradizionali)
- Più volatile (noise da social media)
- Meno predittivo per movimenti istituzionali

---

## 🔄 Nuova Strategia Ibrida Implementata

### Per Crypto (BTC, ETH):
1. **Primary**: Fear & Greed Index (retail sentiment)
2. **Secondary**: COT sentiment (Bitcoin futures quando disponibili)

### Per Forex/Indices/Commodities:
1. **Primary**: COT sentiment (istituzionale)
2. **Secondary**: Nessun retail diretto (COT già ottimale)

---

## 📈 Long/Short Percentage Calculation

### COT Method (Current):
```python
total = long_contracts + short_contracts
long_pct = (long_contracts / total) × 100
short_pct = (short_contracts / total) × 100
```

**Esempio**: Long=150k, Short=100k
- Total = 250k
- Long % = 60%
- Short % = 40%

### Fear & Greed Method (New for Crypto):
```python
# Fear & Greed value is 0-100
long_pct = fear_greed_value  # Direct mapping
short_pct = 100 - fear_greed_value
```

**Esempio**: Fear & Greed = 65 (Greed)
- Long % = 65%
- Short % = 35%

---

## 🛠️ API Response Format

### Current Response:
```json
{
  "assetId": "SP500",
  "current": {
    "score": 31.4,
    "interpretation": "Slightly Bullish",
    "color": "#34d399",
    "longPercentage": 60.0,
    "shortPercentage": 40.0,
    "source": "COT Calculated",
    "components": {
      "netPosition": 50000,
      "wowDelta": 10000,
      "long": 150000,
      "short": 100000
    }
  },
  "history": [...],
  "priceHistory": [...]
}
```

### With Fear & Greed (BTC):
```json
{
  "assetId": "BTC",
  "current": {
    "score": 30.0,  // Converted from FG 65
    "interpretation": "Greed",
    "longPercentage": 65.0,
    "shortPercentage": 35.0,
    "source": "Fear & Greed Index (Retail)",
    "rawValue": 65,
    "classification": "Greed"
  }
}
```

---

## 📚 Fonti dei Dati

1. **COT Data**: CFTC (Commodity Futures Trading Commission) - https://www.cftc.gov/
2. **Fear & Greed Index**: Alternative.me - https://api.alternative.me/fng/
3. **Price History**: Yahoo Finance - yfinance library

---

## 🎓 Approfondimenti

### Perché il COT è un Leading Indicator?

**Smart Money Theory**: Gli istituzionali (smart money) posizionano contratti **prima** dei movimenti di prezzo:
- Accumulo estremo long → Pre-rally setup
- Distribuzione estrema short → Pre-crash setup

**Esempio Storico**: Marzo 2020 (COVID crash)
- COT Net Position SP500: **-120,000** (estremo bearish)
- Sentiment Score: **-85** (Extremely Bearish)
- Risultato: Rally +70% nei successivi 12 mesi (contrarian signal)

### Quando il Sentiment Fallisce?

⚠️ **Black Swan Events**:
- COT non prevede eventi improvvisi (COVID, 9/11, guerre)
- In questi casi, sentiment diventa lagging indicator

✅ **Best Practices**:
- Combina sentiment con analisi tecnica (supporti/resistenze)
- Usa sentiment come **conferma**, non come unico segnale
- Estremi sentiment sono più affidabili dei valori neutrali

---

**Ultimo aggiornamento**: 2026-05-07  
**Autore**: Speculative Alpha Platform
