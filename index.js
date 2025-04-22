require('dotenv').config();
const express = require('express');
const axios = require('axios');
const webpush = require('web-push');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Configuración de claves VAPID
const vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY
};
webpush.setVapidDetails(
  'mailto:alertas@stockapp.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// Suscripciones de clientes
let subscriptions = [];

// Endpoint para suscribirse a notificaciones
app.post('/subscribe', (req, res) => {
  const subscription = req.body;
  subscriptions.push(subscription);
  res.status(201).json({ message: 'Suscripción guardada' });
});

// Endpoint para test de notificación manual
app.post('/notify', async (req, res) => {
  const { title, body } = req.body;
  for (const sub of subscriptions) {
    await webpush.sendNotification(sub, JSON.stringify({ title, body }));
  }
  res.json({ message: 'Notificaciones enviadas' });
});

// Consulta precios y envía alertas
const STOCKS = [
  { symbol: 'AMZN', name: 'Amazon' },
  { symbol: 'NVDA', name: 'NVIDIA' },
  { symbol: 'BRK-B', name: 'Berkshire Hathaway' }
];
let lastPrices = {};

async function checkStocks() {
  for (const stock of STOCKS) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${stock.symbol}?interval=1d&range=1d`;
      const res = await axios.get(url);
      const price = res.data.chart.result[0].meta.regularMarketPrice;
      const prevClose = res.data.chart.result[0].meta.chartPreviousClose;
      const changePercent = ((price - prevClose) / prevClose) * 100;
      const key = stock.symbol;
      // Umbrales de ejemplo (puedes personalizar)
      const buyThreshold = parseFloat(process.env.BUY_THRESHOLD || '5');
      const sellThreshold = parseFloat(process.env.SELL_THRESHOLD || '5');
      // Solo alerta si hay un cambio desde la última vez
      if (lastPrices[key] !== undefined) {
        if (changePercent <= -buyThreshold) {
          await sendAlert(`${stock.name}: ¡Oportunidad de compra! Bajó ${changePercent.toFixed(2)}%`);
        } else if (changePercent >= sellThreshold) {
          await sendAlert(`${stock.name}: ¡Momento de vender! Subió ${changePercent.toFixed(2)}%`);
        }
      }
      lastPrices[key] = changePercent;
      lastPrices[key + '_price'] = price;
    } catch (e) {
      // Ignora errores de consulta
    }
  }
}

async function sendAlert(message) {
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(sub, JSON.stringify({ title: 'Alerta de acciones', body: message }));
    } catch (err) {
      // Si la suscripción ya no es válida, la eliminamos
      subscriptions = subscriptions.filter(s => s !== sub);
    }
  }
}

// Consulta cada 5 minutos
setInterval(checkStocks, 5 * 60 * 1000);

// Endpoint para obtener los precios actuales
app.get('/precios', (req, res) => {
  const precios = {};
  for (const stock of STOCKS) {
    precios[stock.symbol] = {
      price: lastPrices[stock.symbol + '_price'] ?? null,
      changePercent: lastPrices[stock.symbol] ?? null
    };
  }
  res.json(precios);
});

app.get('/', (req, res) => {
  res.send('Stock Alert Backend funcionando');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});
