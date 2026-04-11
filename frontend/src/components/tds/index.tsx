// Stub implementations of @toss/tds-mobile components
// Replace with `import { ... } from '@toss/tds-mobile'` when package is available

import React from 'react';

interface TextProps {
  typography?: 'title1' | 'title2' | 'body1' | 'body2' | 'caption1';
  color?: 'primary' | 'secondary' | 'danger';
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export function Text({ typography, color, style, children }: TextProps) {
  const fontSizeMap = {
    title1: 24, title2: 20, body1: 16, body2: 14, caption1: 12,
  };
  const colorMap = {
    primary: '#3182F6', secondary: '#8B8B8B', danger: '#F04452',
  };
  return (
    <div style={{
      fontSize: typography ? fontSizeMap[typography] : 14,
      color: color ? colorMap[color] : '#191F28',
      display: 'block',
      ...style,
    }}>
      {children}
    </div>
  );
}

interface ButtonProps {
  variant?: 'primary' | 'secondary';
  size?: 'small' | 'medium' | 'large';
  onClick?: () => void;
  disabled?: boolean;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export function Button({ variant = 'primary', size = 'medium', onClick, disabled, style, children }: ButtonProps) {
  const paddingMap = { small: '4px 8px', medium: '8px 16px', large: '14px 20px' };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: variant === 'primary' ? '#3182F6' : '#F2F4F6',
        color: variant === 'primary' ? '#fff' : '#191F28',
        border: 'none',
        borderRadius: 8,
        padding: paddingMap[size],
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontWeight: 600,
        fontSize: size === 'small' ? 12 : size === 'large' ? 16 : 14,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

interface BadgeProps {
  variant?: 'primary' | 'secondary';
  children: React.ReactNode;
}

export function Badge({ variant = 'primary', children }: BadgeProps) {
  return (
    <span style={{
      background: variant === 'primary' ? '#E8F3FF' : '#F2F4F6',
      color: variant === 'primary' ? '#3182F6' : '#8B8B8B',
      borderRadius: 4,
      padding: '2px 6px',
      fontSize: 12,
      fontWeight: 600,
    }}>
      {children}
    </span>
  );
}

interface ListRowProps {
  title: string;
  description?: string;
  right?: React.ReactNode;
  onClick?: () => void;
}

export function ListRow({ title, description, right, onClick }: ListRowProps) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 0',
        borderBottom: '1px solid #F2F4F6',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div>
        <Text typography="body1">{title}</Text>
        {description && <Text typography="body2" color="secondary">{description}</Text>}
      </div>
      {right && <div>{right}</div>}
    </div>
  );
}

interface ProgressBarProps {
  value: number; // 0-100
}

export function ProgressBar({ value }: ProgressBarProps) {
  return (
    <div style={{ background: '#F2F4F6', borderRadius: 4, height: 4, width: '100%' }}>
      <div style={{
        background: '#3182F6',
        borderRadius: 4,
        height: '100%',
        width: `${Math.min(100, Math.max(0, value))}%`,
        transition: 'width 0.2s',
      }} />
    </div>
  );
}
