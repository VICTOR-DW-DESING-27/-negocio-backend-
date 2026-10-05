const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Health check
app.get('/', (req, res) => res.json({ status: 'ok', db: !!supabase }));

// Sync: obtener todos los datos
app.post('/sync', async (req, res) => {
  try {
    const tables = ['users', 'products', 'sales', 'boxes', 'credits', 'credit_payments', 'inventory_moves', 'settings'];
    const data = {};
    
    for (const table of tables) {
      const { data: rows, error } = await supabase.from(table).select('*');
      if (error) throw error;
      data[table] = rows || [];
    }
    
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Guardar registro (INSERT o UPDATE)
app.post('/put/:table', async (req, res) => {
  try {
    const { table } = req.params;
    const record = req.body;
    const { id, ...data } = record;
    
    // Mapear campos del frontend al backend
    const mapped = mapFields(table, data);
    
    const { data: result, error } = await supabase
      .from(table)
      .upsert({ id, ...mapped }, { onConflict: 'id' });
    
    if (error) throw error;
    res.json({ id, ...mapped });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Eliminar registro
app.delete('/:table/:id', async (req, res) => {
  try {
    const { table, id } = req.params;
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Exportar Excel
app.post('/export', async (req, res) => {
  try {
    const XLSX = require('xlsx');
    const { tables: tableNames } = req.body;
    
    const wb = XLSX.utils.book_new();
    
    for (const name of tableNames) {
      const { data: rows, error } = await supabase.from(name).select('*');
      if (error) throw error;
      
      if (rows && rows.length > 0) {
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, name);
      }
    }
    
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename=respaldo.xlsx');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Importar desde Excel
app.post('/import', async (req, res) => {
  try {
    const XLSX = require('xlsx');
    const { file, table } = req.body;
    
    const buffer = Buffer.from(file, 'base64');
    const wb = XLSX.read(buffer);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);
    
    const mapped = rows.map(r => mapFields(table, r));
    
    const { error } = await supabase.from(table).upsert(mapped, { onConflict: 'id' });
    if (error) throw error;
    
    res.json({ imported: mapped.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Función auxiliar: mapear nombres de campos
function mapFields(table, data) {
  const mapping = {
    products: { stockTs: 'stock_ts', includeIva: 'includes_iva', minStock: 'min_stock' },
    sales: { cashier: 'cashier', boxId: 'box_id', iva: 'iva', recvU: 'recv_u', recvB: 'recv_b', chgU: 'chg_u', chgB: 'chg_b' },
    boxes: { uid: 'uid', cashier: 'cashier', openedAt: 'opened_at', closedAt: 'closed_at', openB: 'open_b', closeU: 'close_u', closeB: 'close_b' },
    credits: { saleId: 'sale_id' },
    creditPayments: { creditId: 'credit_id', boxId: 'box_id' },
    inventoryMoves: { uid: 'uid', userName: 'user_name', productId: 'product_id', productName: 'product_name', afterQty: 'after_qty' },
    settings: { pinHash: 'pin_hash', pinSalt: 'pin_salt' }
  };
  
  const map = mapping[table] || {};
  const result = {};
  
  for (const [key, value] of Object.entries(data)) {
    const dbKey = Object.entries(map).find(([k]) => k === key)?.[1] || key;
    result[dbKey] = value;
  }
  
  return result;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend escuchando en puerto ${PORT}`));
