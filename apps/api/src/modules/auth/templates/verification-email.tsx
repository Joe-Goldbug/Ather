import React from 'react';
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Text,
  Heading,
} from '@react-email/components';

interface VerificationEmailProps {
  validationCode: string;
}

export default function VerificationEmail({ validationCode }: VerificationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Ather 登录验证码</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Ather</Heading>
          <Section style={section}>
            <Text style={text}>
              您的登录验证码是：
            </Text>
            <Text style={codeStyle}>
              {validationCode}
            </Text>
            <Text style={subText}>
              验证码将在 5 分钟后失效。如果您没有请求登录，请忽略此邮件。
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// Minimalist Analytics styling
const main = {
  backgroundColor: '#fafafa',
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const container = {
  margin: '0 auto',
  padding: '40px 20px',
  width: '100%',
  maxWidth: '600px',
  backgroundColor: '#ffffff',
  border: '1px solid #e5e5e5',
  borderRadius: '4px',
};

const heading = {
  fontSize: '28px',
  fontWeight: '700',
  color: '#171717',
  margin: '0 0 24px',
  textAlign: 'center' as const,
  letterSpacing: '0.1em',
};

const section = {
  textAlign: 'center' as const,
};

const text = {
  color: '#737373',
  fontSize: '16px',
  margin: '0 0 20px',
};

const codeStyle = {
  display: 'inline-block',
  padding: '16px 24px',
  backgroundColor: '#fafafa',
  border: '1px solid #e5e5e5',
  borderRadius: '4px',
  color: '#171717',
  fontSize: '32px',
  fontWeight: 'bold',
  letterSpacing: '0.2em',
  margin: '0 0 24px',
};

const subText = {
  color: '#a3a3a3',
  fontSize: '14px',
  margin: '0',
};
