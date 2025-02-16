Cloudillo - A distributed collaboration application platform for privacy-focused users
======================================================================================

**Your Data, Your Rules**

What is Cloudillo and Why Does It Exist?
----------------------------------------

Online collaboration platforms typically fall into two categories:

1. **Cloud-based services:** Convenient but may raise concerns about privacy, bias, ads, and censorship.
2. **Self-hosted applications:** Provide flexibility but challenging to set up and don't integrate well with each other.

Cloudillo aims to bridge this gap by offering a self-hosted platform that connects users with the convenience of cloud services without sacrificing privacy and control over data.

Learn more at [cloudillo.org](https://cloudillo.org).

Installation
------------

Cloudillo is a work in progress.
We are regularly publishing docker images on [Docker Hub](https://hub.docker.com/r/cloudillo/cloudillo), so you can easily check it out.

Documentation is currently limited, but if you are comfortable with experimentation, you can install Cloudillo from source and explore its functionality.

Some quick instructions:

### Compiling

Ensure you have *pnpm* installed. You can find installation instructions at https://pnpm.io/installation.

```bash
git clone https://github.com/cloudillo/cloudillo.git
cd cloudillo
pnpm install
pnpm -r build
```

### Running in standalone mode

Standalone mode means that your Cloudillo instance will be accessible on a public IP address on port 80/http and 443/https.
In this mode you don't need to run a reverse proxy, just open the ports (or forward them on your router) and it handles everything, even automatic certificate management with Let's Encrypt.

You will need to configure DNS records for each Cloudillo Identity (profile). For example if you use **agatha.example.com** as your Cloudillo Identity and your Cloudillo instance is reachable at the 1.2.3.4 IP address, you will need to create the following DNS records:

```
cl-o.agatha.example.com    A    1.2.3.4
agatha.example.com         A    1.2.3.4
```

The first address will be used by applications and other nodes to access the Cloudillo APIs. The second will be used by you to access your node.
Once the DNS records are configured and propagated, you can start your Cloudillo instance by running the following commands:

```bash
cd cloudillo/basic-server
export LOCAL_IPS=1.2.3.4
export LOCAL_DOMAINS=agatha.example.com
export ACME_EMAIL=agatha@example.com
pnpm start-standalone
```

By default, Cloudillo will create a directory called 'data' in the current directory and stores everything there.
You can change the location, the listen ports and some other stuff (see basic-server/src/index.ts).

### Running in proxy mode

If you want to run Cloudillo behind a reverse proxy, you will need to configure the proxy accordingly. I provide an example nginx configuration below, you can use it for your starting point.

```
server {
	listen   80;
	server_name  agatha.example.com cl-o.agatha.example.com;

	location /.well-known/ {
        root    /var/www/certbot;
        autoindex off;
    }
	location / {
		return 301 https://$host$request_uri;
	}
}

server {
	listen 443 ssl;
	server_name  agatha.example.com cl-o.agatha.example.com;
	ssl_certificate /etc/letsencrypt/live/agatha.example.com/fullchain.pem;
	ssl_certificate_key /etc/letsencrypt/live/agatha.example.com/privkey.pem;

	location /api {
		rewrite /api/(.*) /api/$1 break;
		proxy_pass http://localhost:3000/;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto https;
		proxy_set_header X-Forwarded-Host $host;
		client_max_body_size 100M;
	}
	location /ws {
		#rewrite /pc/ws/(.*) /$1 break;
		proxy_pass http://localhost:3000;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto https;
		proxy_set_header X-Forwarded-Host $host;
		proxy_set_header Upgrade $http_upgrade;
		proxy_set_header Connection "Upgrade";
	}
	location / {
		root /home/agatha/cloudillo/shell/dist;
		try_files $uri /index.html;
		autoindex off;
		expires 0;
	}
}
```

You can start your Cloudillo instance by running the following commands:

```bash
cd cloudillo/basic-server
export LOCAL_IPS=1.2.3.4
export LOCAL_DOMAINS=agatha.example.com
export LISTEN=3000
pnpm start
```

You have to also configure certbot to automatically renew your SSL certificates.
With some more configuration Cloudillo can do it for you, but it is out of scope of this document.
