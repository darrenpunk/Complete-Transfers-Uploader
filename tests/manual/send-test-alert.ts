import { sendMail } from '../../server/mailersend-client';

(async () => {
  const result = await sendMail({
    to: 'darren@serigraf.com',
    subject: '[TEST — please ignore] completetransfers.com PDF health alert path',
    text: [
      'This is a one-off test email from the new PDF health monitor.',
      '',
      'No action needed — we are verifying that alert emails can actually reach you.',
      '',
      'If you received this, the alerting path is working end-to-end.',
      '',
      'You will only receive future emails from this address when the automated PDF',
      'health probe detects a real generation failure (with a 30-minute cooldown',
      'between alerts of the same type).',
    ].join('\n'),
  });
  console.log(JSON.stringify(result, null, 2));
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
