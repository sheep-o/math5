FROM node:18-bullseye
RUN apt update && apt upgrade -y
RUN apt install -y pip --no-install-recommends
RUN apt install -y --no-install-recommends ffmpeg libsm6 libxext6 curl gnupg
RUN apt install -y --no-install-recommends software-properties-common apt-transport-https wget ca-certificates gnupg2
# Install Chrome
RUN curl --location --silent https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
  && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
  && apt update \
  && apt install google-chrome-stable -y --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*
RUN rm -rf /var/lib/apt/lists/*
RUN apt clean
# Setup app folder and install node dependencies
RUN git clone https://github.com/sheep-o/math5.git /app
WORKDIR /app
RUN python3 -m pip install editdistance
RUN python3 -m pip install lmdb
RUN python3 -m pip install matplotlib
RUN python3 -m pip install numpy
RUN python3 -m pip install opencv-python
RUN python3 -m pip install path
RUN python3 -m pip install tensorflow
RUN python3 -m pip cache purge
RUN npm ci
EXPOSE 3000
CMD node .