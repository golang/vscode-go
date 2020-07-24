# This Docker container is used for testing on GCB.

FROM golang:1.14 AS gobuilder

ENV GO111MODULE on
ENV GOBIN /gobin
ENV GOPROXY https://proxy.golang.org
RUN cd $(mktemp -d) && go get golang.org/x/tools/gopls@latest

FROM node:latest

# GO111MODULE=auto
RUN mkdir /go
COPY --from=gobuilder /gobin /go/bin
COPY --from=gobuilder /usr/local/go /usr/local/go

ENV PATH=${GOPATH}/bin:/usr/local/go/bin:${PATH}
ENV DEBIAN_FRONTEND noninteractive

RUN apt-get update && apt-get install -y libnss3 libgtk-3-dev libxss1 libasound2 xvfb libsecret-1-0

# Install other Go tools tests depend on
RUN GO111MODULE=on go get -x -v github.com/acroca/go-symbols &&
    GO111MODULE=on go get -x -v github.com/cweill/gotests/... &&
	GO111MODULE=on go get -x -v github.com/davidrjenni/reftools/cmd/fillstruct &&
	GO111MODULE=on go get -x -v	github.com/haya14busa/goplay/cmd/goplay &&
  	GO111MODULE=on go get -x -v github.com/mdempsky/gocode &&
  	GO111MODULE=on go get -x -v github.com/ramya-rao-a/go-outline &&
  	GO111MODULE=on go get -x -v github.com/rogpeppe/godef &&
  	GO111MODULE=on go get -x -v github.com/sqs/goreturns &&
  	GO111MODULE=on go get -x -v github.com/uudashr/gopkgs/v2/cmd/gopkgs &&
  	GO111MODULE=on go get -x -v github.com/zmb3/gogetdoc &&
  	GO111MODULE=on go get -x -v golang.org/x/lint/golint &&
  	GO111MODULE=on go get -x -v golang.org/x/tools/cmd/gorename

WORKDIR /workspace
ENTRYPOINT ["build/all.bash"]
