import { Badge } from '@/components/ui/badge';
import { WebhookEventStatus } from '@lukittu/shared';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  XCircle,
} from 'lucide-react';

export const WebhookStatusBadge = ({
  status,
}: {
  status: WebhookEventStatus;
}) => {
  const getStatusVariant = (status: string) => {
    switch (status) {
      case WebhookEventStatus.DELIVERED:
        return 'success';
      case WebhookEventStatus.FAILED:
        return 'error';
      case WebhookEventStatus.IN_PROGRESS:
        return 'warning';
      case WebhookEventStatus.PENDING:
      case WebhookEventStatus.RETRY_SCHEDULED:
        return 'secondary';
      default:
        return 'secondary';
    }
  };

  const getStatusIcon = (status: WebhookEventStatus) => {
    switch (status) {
      case WebhookEventStatus.DELIVERED:
        return <CheckCircle className="mr-1 h-3 w-3" />;
      case WebhookEventStatus.FAILED:
        return <XCircle className="mr-1 h-3 w-3" />;
      case WebhookEventStatus.IN_PROGRESS:
        return <Loader2 className="mr-1 h-3 w-3 animate-spin" />;
      case WebhookEventStatus.RETRY_SCHEDULED:
        return <Clock className="mr-1 h-3 w-3" />;
      case WebhookEventStatus.PENDING:
        return <AlertCircle className="mr-1 h-3 w-3" />;
      default:
        return <AlertCircle className="mr-1 h-3 w-3" />;
    }
  };

  return (
    <Badge className="text-xs" variant={getStatusVariant(status)}>
      {getStatusIcon(status)}
      {status}
    </Badge>
  );
};
