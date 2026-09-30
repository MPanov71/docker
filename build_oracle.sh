#!/bin/sh
    D=$(date  +%Y-%m-%d)
    T=$(date +%H:%M:%S)
    echo " "
    echo  "Time: " $T
    echo " "

    echo "--------------- copy Dockerfile  ------"
#    cp -f Dockerfile.oraclelinux ./Dockerfile

    echo "--------------- remove old image ------"
#    docker image rm compile_oracle

    echo "--------------- clear builder cache ------"
#    docker builder prune -f

    echo "--------------- building compile image ----"
#    docker build . --tag compile_oracle

    docker image ls

    echo "---------------- compiling software ------"
    docker run --rm -it -v /home/mark/work/zanova2/:/compile -e TZ=Europe/Moscow compile_oracle tserver

#    cp -f /home/mark/work/zanova/!old/sctms ./sctms
#    cp -f /home/mark/work/zanova/sctbot ./sctbot
#    cp -f /home/mark/work/zanova/tserver ./tserver
echo "---------------- FINISHED! ---------------"
