import type { Metadata } from "next";
import LegalShell from "@/components/legal-shell";

export const metadata: Metadata = {
  title: "Privacy Policy - AutoReplies",
  description:
    "How AutoReplies, run by Original Copy Studio in Singapore, handles Instagram comments, private replies, link clicks and customer account data.",
};

const sectionTitle = "text-xl font-bold text-foreground";
const link = "text-accent underline underline-offset-4";

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      description="AutoReplies sends a private reply through Meta's official API when someone comments on a connected Instagram post or reel. This policy explains what data that involves, who can see it and how to have it deleted."
      updatedAt="October 5, 2026"
    >
      <section>
        <h2 className={sectionTitle}>Who Runs AutoReplies</h2>
        <p className="mt-3">
          The hosted service at reply.originalcopy.studio is run by Original
          Copy Studio Pte Ltd, a company registered in Singapore (&quot;we&quot;,
          &quot;us&quot;). We follow Singapore&apos;s Personal Data Protection
          Act 2012 (PDPA). Our Data Protection Officer is Dominic Ho.
        </p>
      </section>

      <section>
        <h2 className={sectionTitle}>If You Comment On A Connected Post</h2>
        <p className="mt-3">
          When you comment on a post or reel from an Instagram account that uses
          AutoReplies, Meta sends us the comment. We store your Instagram user
          ID and username, the comment text and its ID, the keyword it matched,
          and whether the private reply (and any public reply) was delivered. If
          the account only sends to followers, we ask Meta whether you follow
          it.
        </p>
        <p className="mt-3">
          If the private reply contains a tracked link and you open it, we
          record the click with a one-way hash of your IP address (never the
          address itself), your browser type and the referring page.
        </p>
        <p className="mt-3">
          We use this only to send the reply you asked for, avoid sending it
          twice and fix delivery problems. We don&apos;t sell it and we
          don&apos;t use it to advertise to you.
        </p>
      </section>

      <section>
        <h2 className={sectionTitle}>If You Sign In To AutoReplies</h2>
        <p className="mt-3">
          We store your email address (to send sign-in links), your workspace
          and team memberships, the Instagram professional account you connect
          (its ID, username, name and access token), your campaign settings,
          keywords, messages and tracked links, and daily follower counts for
          the connected account.
        </p>
      </section>

      <section>
        <h2 className={sectionTitle}>Instagram And Meta Data</h2>
        <p className="mt-3">
          AutoReplies connects through Instagram Login and Meta&apos;s official
          Graph API. It never asks for Instagram passwords, doesn&apos;t scrape
          Instagram and doesn&apos;t use browser automation. Access tokens are
          encrypted at rest and used only for actions the connected business
          account has authorised.
        </p>
      </section>

      <section>
        <h2 className={sectionTitle}>Service Providers</h2>
        <p className="mt-3">
          These companies process data for us, only as needed to run the
          service:
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>Netlify: hosts the app and runs its scheduled jobs (United States)</li>
          <li>Supabase: the database that stores the data above (South Korea)</li>
          <li>Resend: sends sign-in emails (United States)</li>
          <li>Meta: the Instagram API (United States and other countries)</li>
        </ul>
        <p className="mt-3">
          AutoReplies has no analytics or advertising trackers. It only sets the
          cookies needed to keep you signed in.
        </p>
      </section>

      <section>
        <h2 className={sectionTitle}>How Long We Keep It</h2>
        <p className="mt-3">
          Comment, delivery and click records stay while the connected account
          is active, so we can prevent duplicate messages and investigate
          problems. Finished queue jobs are deleted automatically. Disconnecting
          Instagram deletes the stored connection and access token along with
          that account&apos;s campaigns, comment and delivery logs, tracked
          links and click records. Raw Meta webhook records and diagnostic logs
          are kept until we delete them on request. You can ask us to delete
          any of this at any time, as described on the{" "}
          <a href="/data-deletion" className={link}>
            Data Deletion
          </a>{" "}
          page.
        </p>
      </section>

      <section>
        <h2 className={sectionTitle}>Your Rights</h2>
        <p className="mt-3">
          You can ask what data we hold about you, ask us to correct it or ask
          us to delete it. Email{" "}
          <a href="mailto:hello@originalcopy.studio?subject=Privacy" className={link}>
            hello@originalcopy.studio
          </a>{" "}
          with &quot;Privacy&quot; in the subject line and we will reply within
          30 days.
        </p>
      </section>

      <section>
        <h2 className={sectionTitle}>Contact</h2>
        <p className="mt-3">
          Original Copy Studio Pte Ltd, Singapore. Data Protection Officer:
          Dominic Ho,{" "}
          <a href="mailto:hello@originalcopy.studio?subject=Privacy" className={link}>
            hello@originalcopy.studio
          </a>
          . The studio&apos;s full privacy policy is at{" "}
          <a href="https://originalcopy.studio/privacy.html" className={link}>
            originalcopy.studio/privacy.html
          </a>
          .
        </p>
      </section>
    </LegalShell>
  );
}
