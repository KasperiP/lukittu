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

interface VerifyEmailTemplateProps {
  fullName: string;
  link: string;
}

export const VerifyEmailTemplate = ({
  fullName,
  link,
}: VerifyEmailTemplateProps) => (
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
    <Preview>Welcome to Lukittu! Verify your email to get started.</Preview>
    <Body className="main" style={main}>
      <Container className="emptyContainer" style={emptyContainer} />
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
            Welcome to Lukittu! We&apos;re excited to have you on board. To
            complete your sign-up and unlock all the features, please confirm
            your email address by clicking the button below:
          </Text>
          <Section style={btnContainer}>
            <Button href={link} style={button}>
              Verify Your Email
            </Button>
          </Section>
          <Text style={paragraph}>
            If the button doesn&apos;t work, simply copy and paste this URL into
            your browser:
          </Text>
          <Link href={link} style={manualLink}>
            {link}
          </Link>
          <Hr style={hr} />
          <Text style={footer}>
            If you have any questions, please contact us at{' '}
            <Link href="mailto:support@lukittu.com">support@lukittu.com</Link>.
          </Text>
          <Text style={footer}>
            Please note, for your security, never share your account information
            with anyone.
          </Text>
        </Section>
      </Container>
      <Container style={emptyContainer} />
    </Body>
  </Html>
);

VerifyEmailTemplate.PreviewProps = {
  fullName: 'Kasperi Pohtinen',
  link: 'https://lukittu.com/forgot-password',
} as VerifyEmailTemplateProps;

export default VerifyEmailTemplate;

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
