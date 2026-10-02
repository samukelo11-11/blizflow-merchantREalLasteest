import React from 'react';
import AdminPanel from '../components/AdminPanel';

export default function MerchantManagement({ merchants, onUpdateMerchant }) {
  return (
    <AdminPanel 
      merchants={merchants} 
      onUpdateMerchant={onUpdateMerchant} 
      defaultSection="merchants"
      defaultTab="all"
    />
  );
}
