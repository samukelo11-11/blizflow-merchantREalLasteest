import React from 'react';
import AdminPanel from '../components/AdminPanel';

export default function SubscriptionManagement({ merchants, onUpdateMerchant }) {
  return (
    <AdminPanel 
      merchants={merchants} 
      onUpdateMerchant={onUpdateMerchant} 
      defaultTab="payment_pending"
    />
  );
}
