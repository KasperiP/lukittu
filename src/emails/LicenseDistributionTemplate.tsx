import {
  Body,
  Column,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components';
import { Fragment } from 'react';

interface LicenseDistributionEmailTemplateProps {
  customerName: string;
  licenseKey: string;
  products: string[];
  teamName: string;
  businessMessage?: string;
  businessLogoUrl?: string;
}

const convertFormattedText = (text: string) => {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  const parts = [];
  let match;

  while ((match = linkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    parts.push(
      <a key={match.index} href={match[2]} style={{ color: '#4153af' }}>
        {match[1]}
      </a>,
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.map((part, index) => {
    if (typeof part === 'string') {
      return part.split(/(\*\*.*?\*\*)/).map((subPart, subIndex) => {
        if (subPart.startsWith('**') && subPart.endsWith('**')) {
          return <b key={`${index}-${subIndex}`}>{subPart.slice(2, -2)}</b>;
        }
        return subPart;
      });
    }
    return part;
  });
};

export const LicenseDistributionEmailTemplate = ({
  customerName,
  licenseKey,
  products,
  teamName,
  businessMessage,
  businessLogoUrl,
}: LicenseDistributionEmailTemplateProps) => (
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
    <Preview>Your License Key for {teamName} Products (via Lukittu)</Preview>
    <Body className="main" style={main}>
      <Container className="emptyContainer" style={emptyContainer} />
      <Container className="container" style={container}>
        <Section className="box">
          <Img
            alt="Business logo"
            height="50"
            src={
              businessLogoUrl || 'https://app.lukittu.com/logo_text_dark.png'
            }
            style={logo}
          />
          <Text style={paragraph}>Hi {customerName},</Text>
          <Text style={paragraph}>
            Thank you for your order! Here is your license key to unlock all the
            features of the <strong>{teamName}</strong> products:
          </Text>
          <Section style={licenseKeyContainer}>
            <Text style={licenseKeyText}>{licenseKey}</Text>
          </Section>
          {products.length >= 1 && (
            <>
              <Text style={paragraph}>
                This license key can be used with the following products:
              </Text>
              <ul style={productContainer}>
                {products.map((product) => (
                  <li key={product} style={productItem}>
                    <Text style={paragraph}>{product}</Text>
                  </li>
                ))}
              </ul>
            </>
          )}

          {businessMessage && (
            <>
              <Hr style={hr} />
              <Text style={customMessage}>
                {businessMessage.split('\n').map((line, index) => (
                  <Fragment key={index}>
                    {convertFormattedText(line)}
                    <br />
                  </Fragment>
                ))}
              </Text>
            </>
          )}

          <Hr style={hr} />
          <Section style={footerContainer}>
            <Row>
              <Column style={footerLogoContainer}>
                <Img
                  alt="Lukittu logo"
                  height="20"
                  src="https://app.lukittu.com/logo_transparent.png"
                  style={footerLogo}
                  width="20"
                />
                <Text style={poweredBy}>
                  Powered by{' '}
                  <strong>
                    <a href="https://lukittu.com" style={{ color: '#8898aa' }}>
                      Lukittu
                    </a>
                  </strong>
                </Text>
              </Column>
            </Row>
          </Section>
          <Text style={aboutLukittu}>
            Lukittu is an upcoming software licensing platform for developers
            and businesses. <br />
            Business inquiries:{' '}
            <a href="mailto:support@lukittu.com">support@lukittu.com</a>.
          </Text>
        </Section>
      </Container>
      <Container style={emptyContainer} />
    </Body>
  </Html>
);

LicenseDistributionEmailTemplate.PreviewProps = {
  customerName: 'Kasperi Pohtinen',
  licenseKey: '12345-67890-12345-67890-12345',
  products: ['Product A', 'Product B', 'Product C'],
  teamName: 'Acme Inc.',
  businessMessage:
    'We hope you enjoy using our products! Please let us know if there is anything else we can do for you.',
  businessLogoUrl: 'https://app.lukittu.com/logo_text_dark.png',
} as LicenseDistributionEmailTemplateProps;

export default LicenseDistributionEmailTemplate;

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

const licenseKeyContainer = {
  backgroundColor: '#f0f4f8',
  borderRadius: '8px',
  margin: '16px 0',
  textAlign: 'center' as const,
};

const licenseKeyText = {
  fontSize: '18px',
  fontWeight: 'bold' as const,
  color: '#4153af',
  fontFamily: 'monospace',
};

const productItem = {
  marginBottom: '8px',
};

const productContainer = {
  paddingLeft: '20px',
};

const hr = {
  borderColor: '#cccccc',
  margin: '20px 0',
};

const footerContainer = {
  marginLeft: 'auto',
  marginRight: 'auto',
  marginTop: '20px',
};

const footerLogoContainer = {
  display: 'flex',
  alignItems: 'center',
};

const poweredBy = {
  color: '#8898aa',
  fontSize: '10px',
  textAlign: 'center' as const,
  margin: '0px',
  marginRight: 'auto',
  marginLeft: '2px',
  lineHeight: '20px!important',
};

const aboutLukittu = {
  ...poweredBy,
  marginTop: '5px',
};

const customMessage = {
  color: '#525f7f',
  fontSize: '16px',
  lineHeight: '26px',
  marginTop: '20px',
};

const footerLogo = {
  marginLeft: 'auto',
  marginRight: '2px',
};
