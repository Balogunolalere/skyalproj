'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, AlertCircle, Package, LogIn } from 'lucide-react';
import { formatNaira } from '@/components/skyal/data';

const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'https://skyalxpaberin-admin.vercel.app';

// Mark as dynamic to avoid prerendering issues with useSearchParams
export const dynamic = 'force-dynamic';

export default function OrderCallbackPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [orderDetails, setOrderDetails] = useState<any | null>(null);

  useEffect(() => {
    let isMounted = true;

    // Read query params once on mount — no state dependencies needed
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('reference') || params.get('trxref');
    const orderNum = params.get('order');

    if (!ref) {
      if (isMounted) {
        setError('Payment reference missing. Please try again.');
        setLoading(false);
      }
      return;
    }

    // Store for display
    if (orderNum && isMounted) setOrderNumber(orderNum);

    // Verify payment with admin API (use ref/orderNum from closure, not state)
    (async () => {
      try {
        const verifyRes = await fetch(`${API_URL}/api/payment/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference: ref }),
        });

        const verifyData = await verifyRes.json();

        if (!verifyRes.ok || !verifyData?.data?.verified) {
          if (isMounted) {
            setError(`Payment verification failed. ${verifyData?.data?.message || verifyData?.error?.message || 'Unknown error'}`);
            setLoading(false);
          }
          return;
        }

        // If verified, try to fetch order details for the receipt
        if (orderNum) {
          try {
            const orderRes = await fetch(`${API_URL}/api/orders?id=${orderNum}&brand=SKYAL`);
            if (orderRes.ok) {
              const orderData = await orderRes.json();
              if (isMounted) {
                setOrderDetails(orderData.data || orderData);
              }
            }
          } catch (e) {
            console.warn('Could not fetch order details', e);
          }
        }

        // Success
        if (isMounted) {
          setLoading(false);
        }
      } catch (e: any) {
        if (isMounted) {
          setError(`Payment verification error: ${e.message}`);
          setLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []); // Run exactly once on mount

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bone">
        <div className="max-w-md mx-auto p-8 bg-vellum border border-hairline rounded-lg text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-laser mx-auto mb-4"></div>
          <h2 className="font-display text-xl text-ink mb-2">Verifying Payment...</h2>
          <p className="text-sm text-thread">Please wait while we confirm your payment</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bone">
        <div className="max-w-md mx-auto p-8 bg-vellum border border-hairline rounded-lg text-center">
          <AlertCircle className="w-16 h-16 text-leather mx-auto mb-4" />
          <h2 className="font-display text-2xl text-ink mb-2">Payment Failed</h2>
          <p className="text-sm text-thread mb-6">{error}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => router.replace('/#order')}
              className="px-6 py-3 bg-laser text-white rounded hover:bg-ink transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={() => router.replace('/#track')}
              className="px-6 py-3 border border-ink/25 text-ink rounded hover:bg-ink hover:text-bone transition-colors"
            >
              Track Order
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Success after verification
  const displayOrder = orderNumber || 'unknown';
  const total = orderDetails?.totalAmount ? formatNaira(orderDetails.totalAmount) : '₦...';
  const service = orderDetails?.serviceLabel || orderDetails?.serviceType || 'Your order';
  // The tracking endpoint no longer returns customer PII — fall back to the
  // customer's own device-stored profile for the receipt display.
  let storedCustomer: { name?: string; email?: string; phone?: string } = {};
  try {
    const raw = localStorage.getItem('skyal_customer');
    if (raw) storedCustomer = JSON.parse(raw) || {};
  } catch {
    // ignore
  }
  const customerName = orderDetails?.customerName || storedCustomer.name || '';
  const customerEmail = orderDetails?.customerEmail || storedCustomer.email || '';
  const customerPhone = orderDetails?.customerPhone || storedCustomer.phone || '';
  const createdAt = orderDetails?.createdAt || new Date().toISOString();

  // Generate and print receipt (opens browser print dialog → save as PDF)
  // NOTE: customer values may come from localStorage — escape before
  // interpolating into the print window's HTML.
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const printReceipt = () => {
    const receiptHTML = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Receipt ${esc(displayOrder)}</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 400px; margin: 40px auto; padding: 20px; color: #1a1a1a; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .brand { color: #d97706; font-weight: 600; font-size: 14px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  td { padding: 8px 0; border-bottom: 1px solid #e5e5e5; font-size: 14px; }
  td:last-child { text-align: right; font-weight: 500; }
  .total { font-size: 18px; font-weight: 700; }
  .footer { margin-top: 24px; font-size: 12px; color: #888; text-align: center; }
  @media print { body { margin: 0; padding: 20px; } }
</style></head><body>
<h1>Skyal Laser Services</h1>
<div class="brand">ORDER RECEIPT</div>
<table>
<tr><td>Order Number</td><td style="font-family:monospace">${esc(displayOrder)}</td></tr>
<tr><td>Service</td><td>${esc(service)}</td></tr>
<tr><td>Customer</td><td>${esc(customerName) || '—'}</td></tr>
<tr><td>Phone</td><td>${esc(customerPhone) || '—'}</td></tr>
<tr><td>Email</td><td>${esc(customerEmail) || '—'}</td></tr>
<tr><td>Date</td><td>${esc(new Date(createdAt).toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' }))}</td></tr>
<tr><td>Status</td><td style="color:#16a34a;font-weight:600">PAID</td></tr>
<tr class="total"><td>Total</td><td>${esc(total)}</td></tr>
</table>
<div class="footer">Thank you for your order!<br>Skyal Laser Services · Wempco Rd, Ogba, Ikeja, Lagos</div>
</body></html>`;
    const w = window.open('', '_blank', 'width=500,height=700');
    if (w) {
      w.document.write(receiptHTML);
      w.document.close();
      w.onload = () => w.print();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bone">
      <div className="max-w-md mx-auto p-8 bg-vellum border border-hairline rounded-lg text-center">
        <CheckCircle2 className="w-16 h-16 text-laser mx-auto mb-4" />
        <h2 className="font-display text-2xl text-ink mb-2">Payment Confirmed!</h2>
        
        {orderDetails ? (
          <>
            <p className="text-sm text-thread mb-6">
              Your order <span className="font-mono font-semibold">{displayOrder}</span> has been paid and is being processed.
            </p>
            <div className="bg-bone/50 rounded p-4 mb-6 text-left">
              <div className="text-sm text-thread mb-2"><strong>Service:</strong> {service}</div>
              <div className="text-sm text-thread mb-2"><strong>Total:</strong> {total}</div>
              <div className="text-sm text-thread mb-2"><strong>Customer:</strong> {customerName}</div>
              <div className="text-sm text-thread mb-2"><strong>Phone:</strong> {customerPhone}</div>
              <div className="text-sm text-thread mb-2"><strong>Email:</strong> {customerEmail}</div>
              <div className="text-sm text-thread">
                <strong>Status:</strong> <span className="font-mono text-laser">PAYMENT_SUCCESS</span>
              </div>
            </div>
            
            {/* Print Receipt Button */}
            <button
              onClick={printReceipt}
              className="px-6 py-3 border border-ink/25 text-ink rounded hover:bg-ink hover:text-bone transition-colors mb-4 flex items-center justify-center gap-2 w-full"
            >
              🖨️ Print / Save Receipt (PDF)
            </button>
          </>
        ) : (
          <p className="text-sm text-thread mb-6">
            Your order has been paid and is being processed.
          </p>
        )}
        
        {/* Print Receipt Button (for when orderDetails is not available) */}
        {!orderDetails && (
          <button
            onClick={printReceipt}
            className="px-6 py-3 border border-ink/25 text-ink rounded hover:bg-ink hover:text-bone transition-colors mb-4 flex items-center justify-center gap-2 w-full"
          >
            🖨️ Print / Save Receipt (PDF)
          </button>
        )}
        
        <div className="flex gap-3 justify-center flex-wrap">
          <button
            onClick={() => router.replace('/#order')}
            className="px-6 py-3 bg-laser text-white rounded hover:bg-ink transition-colors"
          >
            Place Another Order
          </button>
          <button
            onClick={() => router.replace('/#track')}
            className="px-6 py-3 border border-ink/25 text-ink rounded hover:bg-ink hover:text-bone transition-colors flex items-center gap-2"
          >
            <Package className="w-4 h-4" /> Track Order
          </button>
          <button
            onClick={() => { window.location.href = '/#login'; }}
            className="px-6 py-3 border border-laser text-laser rounded hover:bg-laser hover:text-white transition-colors flex items-center gap-2"
          >
            <LogIn className="w-4 h-4" /> Dashboard Login
          </button>
        </div>
      </div>
    </div>
  );
}
