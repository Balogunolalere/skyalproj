'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, AlertCircle, Package, Truck, CheckCircle, LogIn } from 'lucide-react';
import { formatNaira } from '@/components/skyal/data';

const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'https://skyalxpaberin-admin.vercel.app';

// Mark as dynamic to avoid prerendering issues with useSearchParams
export const dynamic = 'force-dynamic';

export default function OrderCallbackPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [orderDetails, setOrderDetails] = useState<any | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const searchParams = new URL(window.location.search).searchParams;
    const reference = searchParams.get('reference');
    const orderNum = searchParams.get('order');

    if (!reference) {
      if (isMounted) {
        setError('Payment reference missing. Please try again.');
        setLoading(false);
      }
      return;
    }

    if (isMounted) {
      setReference(reference);
      setOrderNumber(orderNum || '');
    }

    // Verify payment with admin API
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/payment/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference }),
        });

        const data = await res.json();

        if (!res.ok || !data?.data?.verified) {
          if (isMounted) {
            setError(`Payment verification failed. ${data?.data?.message || data?.error?.message || 'Unknown error'}`);
            setLoading(false);
          }
          return;
        }

        // If verified, try to fetch order details
        if (orderNum) {
          try {
            const orderRes = await fetch(`${API_URL}/api/orders?id=${orderNum}`);
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

        // Success - show receipt instead of loading
        if (isMounted) {
          setLoading(false);
          setShowReceipt(true);
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
  }, [router, API_URL, orderNumber]);

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
              onClick={() => router.replace('/order')}
              className="px-6 py-3 bg-laser text-white rounded hover:bg-ink transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={() => router.replace('/track')}
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
  const email = orderDetails?.customerEmail || '';
  const phone = orderDetails?.customerPhone || '';
  const createdAt = orderDetails?.createdAt || new Date().toISOString();

  // Generate and download receipt
  const downloadReceipt = () => {
    const content = `SKYAL LASER SERVICES
ORDER RECEIPT

Order Number: ${displayOrder}
Service: ${service}
Total Amount: ${total}
Customer: ${email}
Phone: ${phone}
Date: ${new Date(createdAt).toLocaleString()}
Status: PAID

Thank you for your order!
`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt-${displayOrder}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
              <div className="text-sm text-thread mb-2"><strong>Customer:</strong> {email}</div>
              <div className="text-sm text-thread mb-2"><strong>Phone:</strong> {phone}</div>
              <div className="text-sm text-thread">
                <strong>Status:</strong> <span className="font-mono text-laser">PAYMENT_SUCCESS</span>
              </div>
            </div>
            
            {/* Download Receipt Button */}
            <button
              onClick={downloadReceipt}
              className="px-6 py-3 border border-ink/25 text-ink rounded hover:bg-ink hover:text-bone transition-colors mb-4 flex items-center justify-center gap-2 w-full"
            >
              📥 Download Receipt
            </button>
          </>
        ) : (
          <p className="text-sm text-thread mb-6">
            Your order has been paid and is being processed.
          </p>
        )}
        
        {/* Download Receipt Button (for when orderDetails is not available) */}
        {!orderDetails && (
          <button
            onClick={downloadReceipt}
            className="px-6 py-3 border border-ink/25 text-ink rounded hover:bg-ink hover:text-bone transition-colors mb-4 flex items-center justify-center gap-2 w-full"
          >
            📥 Download Receipt
          </button>
        )}
        
        <div className="flex gap-3 justify-center flex-wrap">
          <button
            onClick={() => router.replace('/order')}
            className="px-6 py-3 bg-laser text-white rounded hover:bg-ink transition-colors"
          >
            Place Another Order
          </button>
          <button
            onClick={() => router.replace('/track')}
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
