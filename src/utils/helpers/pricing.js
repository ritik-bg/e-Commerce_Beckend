// pricing.js
// Server-side pricing. Keep these rules identical to Checkout.jsx.
// The frontend total is for display only; this is the amount that gets charged.

const GST_SLAB_LIMIT = 2500; // per-piece price
const GST_LOW = 5;
const GST_HIGH = 18;

const FREE_DELIVERY_ABOVE = 999;
const DELIVERY_CHARGE = 60;
const PLATFORM_FEE = 10;

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const getGstRate = (unitPrice) => (unitPrice > GST_SLAB_LIMIT ? GST_HIGH : GST_LOW);

/**
 * @param {Array<{productId, name, new_price, quantity}>} items  prices must come from the DB
 */
function calculateTotals(items) {
  const lines = items.map((item) => {
    const lineTotal = round2(item.new_price * item.quantity);
    const gstRate = getGstRate(item.new_price);
    const gst = round2((lineTotal * gstRate) / 100);
    return { ...item, lineTotal, gstRate, gst };
  });

  const subtotal = round2(lines.reduce((a, l) => a + l.lineTotal, 0));
  const gstTotal = round2(lines.reduce((a, l) => a + l.gst, 0));
  const delivery = subtotal === 0 || subtotal >= FREE_DELIVERY_ABOVE ? 0 : DELIVERY_CHARGE;
  const platformFee = subtotal === 0 ? 0 : PLATFORM_FEE;
  const grandTotal = round2(subtotal + gstTotal + delivery + platformFee);

  return {
    lines,
    subtotal,
    gstTotal,
    delivery,
    platformFee,
    grandTotal,
    amountInPaise: Math.round(grandTotal * 100),
  };
}

export { calculateTotals };