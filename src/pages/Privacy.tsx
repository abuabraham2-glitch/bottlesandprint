export default function Privacy() {
  return (
    <div className="min-h-screen bg-background flex items-start justify-center px-6 py-16">
      <div className="max-w-2xl w-full">
        <h1 className="font-serif text-3xl text-foreground mb-1">Privacy Policy</h1>
        <p className="text-muted-foreground text-sm mb-1">Bottles &amp; Print — Order Manager</p>
        <p className="text-muted-foreground text-xs mb-8">Last updated: February 2026</p>

        <div className="space-y-5 text-sm leading-relaxed text-foreground/85">
          <p>Bottles &amp; Print Order Manager is a private, internal business application used solely by Bottles &amp; Print for managing customer orders, invoicing, and shipping.</p>

          <div>
            <h2 className="font-serif text-lg mb-1">Data Collection</h2>
            <p>This application collects and stores business data including client company names, contact information, order details, and financial transaction records. This data is entered manually by the business owner.</p>
          </div>

          <div>
            <h2 className="font-serif text-lg mb-1">Third-Party Services</h2>
            <p>This application integrates with QuickBooks Online for invoicing and accounting purposes. Data shared with QuickBooks Online is limited to customer names, addresses, and invoice/payment details necessary for accounting functions.</p>
          </div>

          <div>
            <h2 className="font-serif text-lg mb-1">Data Storage</h2>
            <p>All data is stored securely using cloud database infrastructure with authentication required for access.</p>
          </div>

          <div>
            <h2 className="font-serif text-lg mb-1">Data Sharing</h2>
            <p>We do not sell, share, or distribute any data to third parties beyond the QuickBooks Online integration described above.</p>
          </div>

          <div>
            <h2 className="font-serif text-lg mb-1">Access</h2>
            <p>This application is accessible only to authorized users of Bottles &amp; Print.</p>
          </div>

          <div>
            <h2 className="font-serif text-lg mb-1">Contact</h2>
            <p>For questions about this policy, contact <a href="mailto:info@bottlesandprint.com" className="text-primary underline">info@bottlesandprint.com</a>.</p>
          </div>
        </div>
      </div>
    </div>
  );
}