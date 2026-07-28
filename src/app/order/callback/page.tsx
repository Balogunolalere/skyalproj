'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, AlertCircle } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'https://skyalxpaberin-admin.vercel.app';

// Mark as dynamic to avoid prerendering issues with useSearchParams
export const dynamic = 'force-dynamic';

export default function OrderCallbackPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);

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

        // Success - we can now show the success page
        // In a real app, you might want to redirect to order confirmation page
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
  }, [router, API_URL]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-laser mx-auto"></div>
          <p className="mt-4 text-thread">Verifying payment...</p>
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
          <button
            onClick={() => router.replace('/order')}
            className="px-6 py-3 bg-laser text-white rounded hover:bg-ink transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Success after verification
  return (
    <div className="min-h-screen flex items-center justify-center bg-bone">
      <div className="max-w-md mx-auto p-8 bg-vellum border border-hairline rounded-lg text-center">
        <CheckCircle2 className="w-16 h-16 text-laser mx-auto mb-4" />
        <h2 className="font-display text-2xl text-ink mb-2">Payment Confirmed!</h2>
        <p className="text-sm text-thread mb-6">
          Your order {orderNumber} has been paid and is being processed.
        </p>
        <button
          onClick={() => router.replace('/order')}
          className="px-6 py-3 bg-laser text-white rounded hover:bg-ink transition-colors"
        >
          Continue Shopping
        </button>
      </div>
    </div>
  );
}
