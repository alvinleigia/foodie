import "server-only";

type Smtp2goEmail = {
  apiKey: string;
  sender: string;
  to: string;
  replyToEmail?: string | null;
  subject: string;
  textBody: string;
  htmlBody: string;
  customHeaders?: Array<{ header: string; value: string }>;
};

export async function sendSmtp2goEmail(input: Smtp2goEmail) {
  const customHeaders = [...(input.customHeaders ?? [])];

  if (input.replyToEmail) {
    customHeaders.push({ header: "Reply-To", value: input.replyToEmail });
  }

  const response = await fetch("https://api.smtp2go.com/v3/email/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_key: input.apiKey,
      sender: input.sender,
      to: [input.to],
      subject: input.subject,
      text_body: input.textBody,
      html_body: input.htmlBody,
      ...(customHeaders.length > 0 ? { custom_headers: customHeaders } : {}),
    }),
  });
  const payload = (await response.json().catch(() => null)) as
    | { data?: { failed?: number; succeeded?: number } }
    | null;

  if (
    !response.ok ||
    payload?.data?.failed !== 0 ||
    payload?.data?.succeeded !== 1
  ) {
    throw new Error(`Email delivery failed with status ${response.status}.`);
  }
}
