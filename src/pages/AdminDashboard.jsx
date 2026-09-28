import React from 'react';
import AdminPanel from '../components/AdminPanel';

export default function AdminDashboard({ merchants, onUpdateMerchant }) {
  return (
    <AdminPanel 
      merchants={merchants} 
      onUpdateMerchant={onUpdateMerchant} 
      defaultTab="all"
    />
  );
}
