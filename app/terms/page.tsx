import type { Metadata } from "next";
import LegalShell from "@/components/legal-shell";

export const metadata: Metadata = {
  title: "Terms of Service - AutoReplies",
  description:
    "Terms for using the hosted AutoReplies Instagram comment-to-DM service, run by Original Copy Studio in Singapore.",
};

const sectionTitle = "text-xl font-bold text-white";
const link = "text-accent underline underline-offset-4";

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of Service"
      description="These terms cover the hosted AutoReplies service at reply.originalcopy.studio, run by Original Copy Studio Pte Ltd in Singapore."
      updatedAt="October 5, 2026"
    >
      <section>
        <h2 className={sectionTitle}>Authorised Use</h2>
        <p className="mt-3">
          You may only use AutoReplies with Instagram professional accounts you
          own or are authorised to manage. You are responsible for the
          campaigns, keywords, links and messages you set up.
        </p>
      </section>

      <section>
        <h2 className={sectionTitle}>Platform Compliance</h2>
        <p className="mt-3">
          You agree to follow the Meta Platform Terms, Instagram&apos;s
          policies and the messaging, privacy, advertising and anti-spam laws
          that apply to you. We may rate-limit, pause or disable campaigns that
          create compliance, abuse, security or deliverability risk.
        </p>
      </section>

      <section>
        <h2 className={sectionTitle}>Availability</h2>
        <p className="mt-3">
          AutoReplies depends on third-party services, including Meta, Netlify,
          Supabase and Resend. We work to keep it running reliably, but we
          can&apos;t guarantee uninterrupted availability.
        </p>
      </section>

      <section>
        <h2 className={sectionTitle}>Open-Source Code</h2>
        <p className="mt-3">
          The AutoReplies source code is public under the MIT licence. These
          terms cover only the hosted service we run at reply.originalcopy.studio,
          not copies other people run themselves.
        </p>
      </section>

      <section>
        <h2 className={sectionTitle}>Governing Law And Contact</h2>
        <p className="mt-3">
          These terms are governed by the laws of Singapore. Questions go to{" "}
          <a href="mailto:hello@originalcopy.studio" className={link}>
            hello@originalcopy.studio
          </a>
          . How we handle data is set out in the{" "}
          <a href="/privacy" className={link}>
            Privacy Policy
          </a>
          .
        </p>
      </section>
    </LegalShell>
  );
}
