# This Docker container is used for testing on GCB.
ARG GOVERSION=1
FROM golang:${GOVERSION} AS gobuilder

ENV GOBIN /gobin

# Install other Go tools tests depend on
RUN mkdir -p /scratch/installtools
ADD tools/installtools/main.go /scratch/installtools/main.go
RUN go run /scratch/installtools/main.go

FROM node:latest

# GO111MODULE=auto
RUN mkdir /go
COPY --from=gobuilder /gobin /go/bin
COPY --from=gobuilder /usr/local/go /usr/local/go

# Add the default GOPATH/bin to the PATH.
# Add the directories of the go tool chains to PATH.
ENV PATH /go/bin:/usr/local/go/bin:${PATH}
ENV DEBIAN_FRONTEND noninteractive

# Force npm to prefer ipv4 - the vm we are using doesn't yet support ipv6.
# TODO(hyangah): remove this when the platform works with ipv6.
ENV NODE_OPTIONS --dns-result-order=ipv4first

RUN apt-get -qq update && apt-get install -qq -y libnss3 libgtk-3-dev libxss1 libasound2 xvfb libsecret-1-0 jq > /dev/null

USER node
WORKDIR /workspace
ENTRYPOINT ["build/all.bash"]