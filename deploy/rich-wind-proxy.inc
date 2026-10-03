# Shared proxy headers, installed as /etc/nginx/rich-wind-proxy.inc.
# One trusted hop (nginx) is in front of the app: RW_TRUST_PROXY=1.
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
