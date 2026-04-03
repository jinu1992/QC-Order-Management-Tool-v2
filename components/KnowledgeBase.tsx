
import React, { useState } from 'react';
import { 
  QuestionMarkCircleIcon, 
  ClipboardListIcon as ShoppingCartIcon, 
  TruckIcon, 
  CheckCircleIcon as ClipboardCheckIcon, 
  CubeIcon as DatabaseIcon, 
  RefreshIcon, 
  InvoiceIcon as DocumentTextIcon, 
  ChevronRightIcon as ArrowRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  SearchIcon
} from './icons/Icons';

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
}

const KBSection: React.FC<SectionProps> = ({ title, icon, children, isOpen, onToggle }) => (
  <div className="border border-partners-border rounded-xl bg-white mb-4 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
    <button 
      onClick={onToggle}
      className="w-full flex items-center justify-between p-5 text-left bg-white hover:bg-gray-50 transition-colors"
    >
      <div className="flex items-center gap-4">
        <div className="p-2.5 bg-partners-gray-bg rounded-lg text-partners-blue-primary">
          {icon}
        </div>
        <h3 className="text-lg font-bold text-gray-900">{title}</h3>
      </div>
      {isOpen ? <ChevronUpIcon className="h-6 w-6 text-gray-400" /> : <ChevronDownIcon className="h-6 w-6 text-gray-400" />}
    </button>
    {isOpen && (
      <div className="px-5 pb-6 text-gray-600 border-t border-gray-100">
        <div className="pt-4 space-y-4 prose prose-partners leading-relaxed max-w-none">
          {children}
        </div>
      </div>
    )}
  </div>
);

const KnowledgeBase: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    'po': true,
    'so': false
  });

  const toggleSection = (id: string) => {
    setOpenSections((prev: Record<string, boolean>) => ({ ...prev, [id]: !prev[id] }));
  };

  const sections = [
    {
      id: 'po',
        title: '1. Purchase Orders (PO) Lifecycle',
        icon: <ShoppingCartIcon className="h-6 w-6" />,
      content: (
        <>
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg mb-4">
            <p className="text-sm text-blue-700">
              <strong>Tip:</strong> The system automatically extracts POs from Gmail every hour. No manual data entry is usually required.
            </p>
          </div>
          <p>This is the starting point of any order. POs are typically received as PDFs from your sales channels.</p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Automated Extraction:</strong> Our backend script monitors Gmail labels like "Zepto PO", "Blinkit PO", etc.</li>
            <li><strong>Data Extraction:</strong> It reads PDFs to extract Line Items, Quantities, MRP, and Unit Cost.</li>
            <li><strong>PO Review:</strong> Go to the "Purchase Orders" tab to verify extraction accuracy and check for SKU mapping errors.</li>
          </ul>
          <div className="flex items-center gap-2 text-partners-blue-primary font-semibold mt-2">
            <span>Next Step: Push to EasyEcom</span>
            <ArrowRightIcon className="h-4 w-4" />
          </div>
        </>
      )
    },
    {
      id: 'so',
      title: '2. Sales Orders (SO) & Synchronization',
      icon: <RefreshIcon className="h-6 w-6" />,
      content: (
        <>
          <p>After reviewing a PO, you need to push it to the logistics aggregator (EasyEcom) to create a Sales Order.</p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Push to EasyEcom:</strong> Click the "Push" button in the PO details. This creates a corresponding order in EasyEcom.</li>
            <li><strong>Status Syncing:</strong> Use the "Targeted Refresh" icon on any order to fetch the latest AWB, Courier Partner, and Shipment status from EasyEcom.</li>
            <li><strong>Sales Order Tab:</strong> This view is your primary dispatch dashboard, showing what needs to be packed and shipped.</li>
          </ul>
        </>
      )
    },
    {
      id: 'logistics',
      title: '3. Shipment Manager & Channel Flow',
      icon: <TruckIcon className="h-6 w-6" />,
      content: (
        <>
          <p>Logistics handling varies by channel:</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <div className="p-4 border border-gray-200 rounded-lg">
              <h4 className="font-bold text-gray-900 mb-2">Flipkart Flow</h4>
              <p className="text-sm">Download Packing Slip -> Generate E-Invoice -> Upload IRN to Dashboard. <em>(Flipkart handles shipping directly).</em></p>
            </div>
            <div className="p-4 border border-gray-200 rounded-lg">
              <h4 className="font-bold text-gray-900 mb-2">Zepto / Blinkit / BB</h4>
              <p className="text-sm">Take Appointment -> Take Gate Pass -> Push to Shipping Partner (Nimbus). <em>(We handle shipping).</em></p>
            </div>
          </div>
        </>
      )
    },
    {
        id: 'finance',
        title: '4. Invoicing & Finance',
        icon: <DocumentTextIcon className="h-6 w-6" />,
        content: (
          <>
            <p>Once orders are "Manifested", the finance workflow begins:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Zoho Invoicing:</strong> Click "Create Zoho Invoice" to automatically sync the order value to Zoho Books.</li>
              <li><strong>E-Invoice (Flipkart):</strong> Standard procedure requires uploading the E-invoice PDF from the Govt portal back to our tool to capture the IRN & Invoice Number.</li>
              <li><strong>Finance Manager:</strong> Track Payment Status (Pending/Received) and Reminders across all marketplace invoices.</li>
            </ul>
          </>
        )
      },
      {
        id: 'inventory',
        title: '5. Inventory & SKU Mapping',
        icon: <DatabaseIcon className="h-6 w-6" />,
        content: (
          <>
            <p>Accurate mapping is the "brain" of the tool:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Master SKU Mapping:</strong> Maps varied Channel Item Codes (FSN/EAN) to a single internal Master SKU.</li>
              <li><strong>Stock Sync:</strong> Fetches live inventory levels from EasyEcom to prevent over-selling.</li>
              <li><strong>Shortfall Analysis:</strong> The Inventory tab shows exactly how many units are needed in stock to fulfill all open POs.</li>
            </ul>
          </>
        )
      },
      {
        id: 'quotations',
        title: '6. Quotations & B2B Estimates',
        icon: <ClipboardCheckIcon className="h-6 w-6" />,
        content: (
          <>
            <p>For custom non-marketplace orders:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Sync Estimates:</strong> Fetches last 14 days of Estimates from Zoho Books.</li>
              <li><strong>Accept & Convert:</strong> Mark a quote as "Accepted" to automatically push it as a processed order to EasyEcom.</li>
            </ul>
          </>
        )
      }
  ];

  const filteredSections = sections.filter(sec => 
    sec.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    sec.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 flex-1 max-w-5xl mx-auto overflow-y-auto">
      <div className="mb-10 text-center">
        <div className="flex items-center justify-center gap-3 mb-4">
           <QuestionMarkCircleIcon className="h-10 w-10 text-partners-blue-primary" />
           <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Help Center & Knowledge Base</h1>
        </div>
        <p className="text-xl text-gray-500 max-w-2xl mx-auto">
          Learn how the tool works and master the order lifecycle channel-wise.
        </p>
      </div>

      <div className="relative mb-10 group max-w-2xl mx-auto">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 text-gray-400 group-hover:text-partners-blue-primary transition-colors" />
        <input 
          type="text" 
          placeholder="Search for processes (e.g. Flipkart, Inventory, Sync)..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-4 bg-white border border-partners-border rounded-2xl shadow-sm focus:ring-4 focus:ring-partners-blue-primary/10 focus:border-partners-blue-primary outline-none transition-all text-lg"
        />
      </div>

      <div className="space-y-2">
        {filteredSections.map(sec => (
          <KBSection 
            key={sec.id}
            title={sec.title} 
            icon={sec.icon}
            isOpen={openSections[sec.id] || false}
            onToggle={() => toggleSection(sec.id)}
          >
            {sec.content}
          </KBSection>
        ))}
        {filteredSections.length === 0 && (
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-300">
            <p className="text-gray-500 text-lg">No matching guides found for "{searchQuery}"</p>
            <button 
              onClick={() => setSearchQuery('')}
              className="mt-4 text-partners-blue-primary font-bold hover:underline"
            >
              Clear search filter
            </button>
          </div>
        )}
      </div>

      <div className="mt-12 p-8 bg-gradient-to-br from-partners-blue-primary to-indigo-700 rounded-3xl text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
           <h2 className="text-2xl font-bold mb-2">Still need help?</h2>
           <p className="text-blue-100 opacity-90">Reach out to the system administrator or check the developer logs.</p>
        </div>
        <button 
           className="px-8 py-4 bg-white text-partners-blue-primary font-bold rounded-2xl shadow-lg hover:bg-blue-50 transition-all hover:scale-105"
           onClick={() => window.open('https://seller.flipkart.com/index.html', '_blank')}
        >
          Contact Support
        </button>
      </div>
    </div>
  );
};

export default KnowledgeBase;
