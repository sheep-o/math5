FROM node:18-bullseye
RUN apt update && apt upgrade -y
RUN apt install -y pip --no-install-recommends
RUN apt install -y --no-install-recommends ffmpeg libsm6 libxext6 curl gnupg
RUN pip install opencv-python
RUN pip cache purge
# Install chrome
RUN curl --location --silent https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
  && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
  && apt update \
  && apt install google-chrome-stable -y --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*
RUN apt clean
# Setup app folder and install node dependencies
RUN mkdir app
WORKDIR /app
COPY . ./
RUN npm ci
EXPOSE 3000
CMD node .