import React from 'react';
import AdminPanel from '../components/AdminPanel';

export default function AdminDashboard({ merchants, onUpdateMerchant, defaultSection = 'overview' }) {
  return (
    <AdminPanel 
      merchants={merchants} 
      onUpdateMerchant={onUpdateMerchant} 
      defaultSection={defaultSection}
      defaultTab="all"
    />
  );
}
