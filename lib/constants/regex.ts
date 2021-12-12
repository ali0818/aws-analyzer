export const _ARN_REGEX = /^arn:aws:([a-zA-Z0-9\-])+:([a-z]{2}-[a-z]+-\d{1})?:(\d{12})?:(.*)$/;

export const ARN_REGEX = /arn:aws:([a-z0-9]+):(\*|[a-z0-9-]*)?:(\*|[0-9]{12}|aws)?:([a-z0-9-]+)\/?(\*|[A-Za-z0-9-_\.:/{}]+)?/;
