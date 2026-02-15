export default function Terms() {
  return (
    <div className="min-h-screen bg-background flex items-start justify-center px-6 py-16">
      <div className="max-w-2xl w-full">
        <h1 className="font-serif text-3xl text-foreground mb-1">Terms of Service</h1>
        <p className="text-muted-foreground text-sm mb-1">Bottles &amp; Print — Order Manager</p>
        <p className="text-muted-foreground text-xs mb-8">Last updated: February 2026</p>

        <div className="space-y-5 text-sm leading-relaxed text-foreground/85">
          <p>Bottles &amp; Print Order Manager is a proprietary internal business application developed for and used exclusively by Bottles &amp; Print.</p>

          <div>
            <h2 className="font-serif text-lg mb-1">Use</h2>
            <p>This application is intended for internal business use only. Access is restricted to authorized personnel of Bottles &amp; Print.</p>
          </div>

          <div>
            <h2 className="font-serif text-lg mb-1">Disclaimer</h2>
            <p>This application is provided as-is for internal business operations. All business data entered into the application remains the property of Bottles &amp; Print.</p>
          </div>

          <div>
            <h2 className="font-serif text-lg mb-1">Intellectual Property</h2>
            <p>All content, design, and functionality of this application are the property of Bottles &amp; Print.</p>
          </div>

          <div>
            <h2 className="font-serif text-lg mb-1">Contact</h2>
            <p>For questions, contact <a href="mailto:info@bottlesandprint.com" className="text-primary underline">info@bottlesandprint.com</a>.</p>
          </div>
        </div>
      </div>
    </div>
  );
}