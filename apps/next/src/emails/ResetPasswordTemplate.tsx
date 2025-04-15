import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';

interface ResetPasswordTemplateProps {
  link: string;
  fullName: string;
}

export const ResetPasswordTemplate = ({
  link,
  fullName,
}: ResetPasswordTemplateProps) => (
  <Html>
    <Head>
      <style>
        {`
          .container {
            padding: 48px;
          }

          @media (max-width: 640px) {
            .container {
              padding: 10px!important;
            }
            
            .emptyContainer {
              display: none;
            }

            .main {
              background-color: #ffffff!important;
            }
          }
        `}
      </style>
    </Head>
    <Preview>Password Reset Request for Your Lukittu Account</Preview>
    <Body className="main" style={main}>
      <Container style={emptyContainer} />
      <Container className="container" style={container}>
        <Section className="box">
          <Img
            alt="Lukittu logo"
            height="50"
            src="https://app.lukittu.com/logo_text_dark.png"
            style={logo}
          />
          <Text style={paragraph}>Hi {fullName},</Text>
          <Text style={paragraph}>
            We received a request to reset the password for your Lukittu
            account. If you made this request, please click the button below to
            reset your password:
          </Text>
          <Section style={btnContainer}>
            <Button href={link} style={button}>
              Reset Your Password
            </Button>
          </Section>
          <Text style={paragraph}>
            If you did not request a password reset, you can safely ignore this
            email. For your security, please make sure to review your account
            activity and update your password if needed.
          </Text>
          <Text style={paragraph}>
            If the button doesn&apos;t work, copy and paste this URL into your
            browser:
          </Text>
          <Link href={link} style={manualLink}>
            {link}
          </Link>
          <Hr style={hr} />
          <Text style={footer}>
            If you need further assistance, please contact our support team at{' '}
            <Link href="mailto:support@lukittu.com">support@lukittu.com</Link>.
          </Text>
          <Text style={footer}>
            Remember, never share your password with anyone, and ensure your
            account uses a strong, unique password.
          </Text>
        </Section>
      </Container>
      <Container style={emptyContainer} />
    </Body>
  </Html>
);

ResetPasswordTemplate.PreviewProps = {
  link: 'https://lukittu.com/reset-password',
  fullName: 'Kasperi Pohtinen',
} as ResetPasswordTemplateProps;

export default ResetPasswordTemplate;

const main = {
  backgroundColor: '#f1f5f9',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  borderRadius: '16px',
  margin: '0 auto',
  maxWidth: '550px',
  width: '100%',
};

const emptyContainer = {
  height: '64px',
};

const logo = {
  marginBottom: '24px',
};

const paragraph = {
  color: '#525f7f',
  fontSize: '16px',
  lineHeight: '26px',
};

const manualLink = {
  color: '#4153af',
  fontSize: '12px',
};

const btnContainer = {
  textAlign: 'center' as const,
};

const button = {
  backgroundColor: '#4153af',
  borderRadius: '6px',
  color: '#fff',
  fontSize: '16px',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  padding: '12px',
  fontWeight: 500,
};

const hr = {
  borderColor: '#cccccc',
  margin: '20px 0',
};

const footer = {
  color: '#8898aa',
  fontSize: '12px',
};
