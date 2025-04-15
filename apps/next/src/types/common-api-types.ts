export interface ErrorResponse {
  field?: string | number;
  message: string;
  [key: string]: any;
}

export interface IExternalDevResponse<T = any> {
  data: T;
  result: {
    timestamp: Date;
    valid: boolean;
    details: string;
  };
}
