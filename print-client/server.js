const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const pdfToPrinter = require('pdf-to-printer');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Simple in-memory config for printer mappings
// E.g., { "bw_a4": "Microsoft Print to PDF", "color_a4": "Epson L3150 Series" }
let printerConfig = {};

// Load config from file if exists
const configPath = path.join(__dirname, 'config.json');
if (fs.existsSync(configPath)) {
  try {
    printerConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.error("Error loading config:", err);
  }
}

const saveConfig = () => {
  fs.writeFileSync(configPath, JSON.stringify(printerConfig, null, 2));
};

// API: Get installed printers
app.get('/api/printers', async (req, res) => {
  try {
    const printers = await pdfToPrinter.getPrinters();
    res.json(printers);
  } catch (err) {
    console.error("Failed to get printers:", err);
    res.status(500).json({ error: "Failed to list printers." });
  }
});

// API: Get current config
app.get('/api/config', (req, res) => {
  res.json(printerConfig);
});

// API: Update config
app.post('/api/config', (req, res) => {
  printerConfig = req.body;
  saveConfig();
  res.json({ success: true });
});

// API: Print a document
app.post('/api/print', async (req, res) => {
  const { fileUrl, orderDetails } = req.body;
  
  if (!fileUrl || !orderDetails) {
    return res.status(400).json({ error: 'Missing fileUrl or orderDetails' });
  }

  const { printType, paperSize, copies, sides } = orderDetails;
  const configKey = `${printType}_${paperSize}`;
  const targetPrinter = printerConfig[configKey];

  if (!targetPrinter) {
    return res.status(400).json({ error: `No printer configured for ${configKey}` });
  }

  try {
    console.log(`Downloading file from ${fileUrl}...`);
    // Download the file to a temp location
    const response = await axios({
      url: fileUrl,
      method: 'GET',
      responseType: 'stream',
    });

    const tempFilePath = path.join(__dirname, `temp_${Date.now()}.pdf`);
    const writer = fs.createWriteStream(tempFilePath);
    
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    console.log(`Printing to ${targetPrinter}...`);
    
    // Set up print options
    const options = {
      printer: targetPrinter,
      copies: copies || 1,
    };
    
    // Attempting to send duplex if required
    // pdf-to-printer uses SumatraPDF under the hood on Windows, duplex support varies.
    
    await pdfToPrinter.print(tempFilePath, options);
    
    // Clean up
    fs.unlinkSync(tempFilePath);
    
    console.log("Print job sent successfully.");
    res.json({ success: true, message: 'Print job sent successfully' });

  } catch (err) {
    console.error("Printing failed:", err);
    res.status(500).json({ error: "Printing failed: " + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Print Client Server running at http://localhost:${PORT}`);
});
